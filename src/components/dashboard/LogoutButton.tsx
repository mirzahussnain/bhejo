"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/shared/components/ui/Button";

export function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleLogout}
      isLoading={isLoggingOut}
      aria-label="Log out of Bhejo"
    >
      Log out
    </Button>
  );
}
