import React from "react";
import type { Metadata } from "next";
import { AuthVisualSide } from "@/components/auth/AuthVisualSide";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In | Bhejo",
  description: "Sign in to manage your scan requests, documents, and recipient sessions.",
};

interface LoginPageProps {
  readonly searchParams: Promise<{ redirectTo?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = params?.redirectTo || "/dashboard";

  return (
    <main className="min-h-screen w-full bg-canvas lg:grid lg:grid-cols-2">
      {/* Left Column: Visual Showcase (Desktop Only) */}
      <AuthVisualSide
        imageSrc="/auth-signin.jpg"
        imageAlt="Person scanning physical lease agreement document with phone camera"
        title="Zero-App Remote Scanning"
        description="Recipients tap your link in WhatsApp or browser to scan and crop documents automatically. Live video feeds never touch remote cloud servers."
      />

      {/* Right Column: Form Area (Centered on Mobile & Desktop) */}
      <div className="flex min-h-screen w-full flex-col justify-center bg-canvas-card px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          {/* Top Center: Official Bhejo Logo & Logotype */}
          <AuthHeader
            title="Welcome Back"
            subtitle="Don't have an account?"
            linkText="Sign up"
            linkHref="/signup"
          />

          {/* Sign In Form */}
          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
