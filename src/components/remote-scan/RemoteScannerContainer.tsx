"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraScanner } from "@/components/scanner/CameraScanner";
import { OtpEntryScreen } from "@/components/remote-scan/OtpEntryScreen";
import { RemoteCompleteScreen } from "@/components/remote-scan/RemoteCompleteScreen";
import { SessionStatusScreen } from "@/components/remote-scan/SessionStatusScreen";
import { UploadErrorScreen } from "@/components/remote-scan/UploadErrorScreen";
import { UploadProgressScreen } from "@/components/remote-scan/UploadProgressScreen";
import {
  uploadRemoteDocument,
  type UploadProgress,
} from "@/lib/remote-scan/uploader";
import type { ScannedDocument } from "@/types/document";
import type { PublicSessionInfo, VerifyOtpResult } from "@/types/remote-scan";

export type RemoteFlowState =
  | "checking"
  | "otp"
  | "scanning"
  | "uploading"
  | "upload-error"
  | "completed"
  | "expired"
  | "locked"
  | "already_completed"
  | "not_found";

interface RemoteScannerContainerProps {
  readonly publicToken: string;
}

export function RemoteScannerContainer({ publicToken }: RemoteScannerContainerProps) {
  const [flowState, setFlowState] = useState<RemoteFlowState>("checking");
  const [sessionTitle, setSessionTitle] = useState<string | undefined>();
  const [recipientToken, setRecipientToken] = useState<string | null>(null);
  const [completedDoc, setCompletedDoc] = useState<ScannedDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    currentPage: 0,
    totalPages: 0,
    percent: 0,
    status: "preparing",
  });

  const lastDocumentRef = useRef<ScannedDocument | null>(null);

  // 1. Initial Session Status Check
  useEffect(() => {
    let isCancelled = false;

    async function checkSession() {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(publicToken)}`);
        if (isCancelled) {
          return;
        }

        if (res.status === 404) {
          setFlowState("not_found");
          return;
        }

        if (res.status === 410) {
          setFlowState("expired");
          return;
        }

        if (!res.ok) {
          setFlowState("not_found");
          return;
        }

        const data = (await res.json()) as PublicSessionInfo;
        setSessionTitle(data.title);

        if (data.status === "expired") {
          setFlowState("expired");
        } else if (data.status === "locked") {
          setFlowState("locked");
        } else if (data.status === "completed") {
          setFlowState("already_completed");
        } else {
          setFlowState("otp");
        }
      } catch {
        if (!isCancelled) {
          setFlowState("not_found");
        }
      }
    }

    void checkSession();
    return () => {
      isCancelled = true;
    };
  }, [publicToken]);

  // 2. Handle OTP Verification
  const handleVerifyOtp = useCallback(
    async (otp: string): Promise<{ success: boolean; error?: string; attemptsRemaining?: number }> => {
      const res = await fetch(`/api/sessions/${encodeURIComponent(publicToken)}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });

      const data = (await res.json()) as VerifyOtpResult;

      if (res.ok && data.success && data.recipientToken) {
        setRecipientToken(data.recipientToken);
        setFlowState("scanning");
        return { success: true };
      }

      if (data.error === "locked") {
        setFlowState("locked");
      } else if (data.error === "expired") {
        setFlowState("expired");
      }

      return {
        success: false,
        error: data.error,
        attemptsRemaining: data.attemptsRemaining,
      };
    },
    [publicToken],
  );

  // 3. Initiate Upload when Scanning Completes
  const startUpload = useCallback(
    async (document: ScannedDocument, token: string) => {
      setFlowState("uploading");
      setUploadError(null);

      try {
        await uploadRemoteDocument(document, publicToken, token, (progress) => {
          setUploadProgress(progress);
        });
        setCompletedDoc(document);
        setFlowState("completed");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload interrupted";
        setUploadError(message);
        setFlowState("upload-error");
      }
    },
    [publicToken],
  );

  const handleScanComplete = useCallback(
    (document: ScannedDocument) => {
      lastDocumentRef.current = document;
      if (!recipientToken) {
        setUploadError("Missing scan session token. Please re-enter the code.");
        setFlowState("otp");
        return;
      }
      void startUpload(document, recipientToken);
    },
    [recipientToken, startUpload],
  );

  const handleRetryUpload = useCallback(() => {
    if (lastDocumentRef.current && recipientToken) {
      void startUpload(lastDocumentRef.current, recipientToken);
    }
  }, [recipientToken, startUpload]);

  // Render Screens
  if (flowState === "checking") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
        <span className="size-10 animate-spin rounded-full border-4 border-white/20 border-t-white motion-reduce:animate-none" />
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-white">
          Checking scan link…
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Connecting to secure session.
        </p>
      </main>
    );
  }

  if (
    flowState === "expired" ||
    flowState === "locked" ||
    flowState === "already_completed" ||
    flowState === "not_found"
  ) {
    return <SessionStatusScreen status={flowState} />;
  }

  if (flowState === "otp") {
    return (
      <OtpEntryScreen
        title={sessionTitle}
        onVerify={handleVerifyOtp}
      />
    );
  }

  if (flowState === "scanning") {
    return (
      <CameraScanner
        suppressDefaultComplete
        onComplete={handleScanComplete}
        onCancel={() => setFlowState("otp")}
      />
    );
  }

  if (flowState === "uploading") {
    return <UploadProgressScreen progress={uploadProgress} />;
  }

  if (flowState === "upload-error") {
    return (
      <UploadErrorScreen
        errorMessage={uploadError ?? undefined}
        onRetry={handleRetryUpload}
        onCancel={() => setFlowState("scanning")}
      />
    );
  }

  if (flowState === "completed") {
    return <RemoteCompleteScreen pageCount={completedDoc?.pages.length ?? 1} />;
  }

  return null;
}
