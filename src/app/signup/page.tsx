import React from "react";
import type { Metadata } from "next";
import { AuthVisualSide } from "@/components/auth/AuthVisualSide";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up | Bhejo",
  description: "Create your Bhejo account to manage remote document scanning.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen w-full bg-canvas lg:grid lg:grid-cols-2">
      {/* Left Column: Visual Showcase (Desktop Only) */}
      <AuthVisualSide
        imageSrc="/auth-signup.jpg"
        imageAlt="Professional viewing completed document scan on phone at workspace desk"
        title="Capture Clean Documents Anywhere"
        description="Share a private link with clients, patients, or family members. Bhejo detects edges, checks stability, and prepares high-resolution scans in seconds."
      />

      {/* Right Column: Form Area (Centered on Mobile & Desktop) */}
      <div className="flex min-h-screen w-full flex-col justify-center bg-canvas-card px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          {/* Top Center: Official Bhejo Logo & Logotype */}
          <AuthHeader
            title="Create an account"
            subtitle="Already have an account?"
            linkText="Sign in"
            linkHref="/login"
          />

          {/* Sign Up Form */}
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
