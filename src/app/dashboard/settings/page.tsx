"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useAuthStore, useAppStore } from "@/stores";
import { getTimezoneOptions } from "@/lib/timezones";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Key, Moon, Sun, Globe, LogOut, ExternalLink, Layers, Palette, Calendar, BookOpen, Lock, Users } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { apiKey, usageStats, logout } = useAuthStore();
  const { timezone, setTimezone, weekStartsOn, setWeekStartsOn } = useAppStore();

  const { data: session } = useSession();
  const [showApiKey, setShowApiKey] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    setPwLoading(true);

    const form = new FormData(e.currentTarget);
    const currentPassword = form.get("currentPassword") as string;
    const newPassword = form.get("newPassword") as string;
    const confirmPassword = form.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      setPwLoading(false);
      return;
    }

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      setPwError(data.error || "Failed to change password.");
      setPwLoading(false);
      return;
    }

    setPwSuccess(true);
    setPwLoading(false);
    (e.target as HTMLFormElement).reset();
  }

  // Compute timezone options - always includes user's browser timezone and current selection
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(timezone),
    [timezone]
  );

  const handleLogout = () => {
    logout();
    signOut({ callbackUrl: "https://polywiz.polymash.com" });
  };

  const maskedApiKey = apiKey
    ? `${apiKey.slice(0, 7)}${"•".repeat(20)}${apiKey.slice(-4)}`
    : "";

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your campaign system, scheduling, and account preferences.
        </p>
      </div>

      {/* ── Campaign System ──────────────────────────── */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Campaign System
        </h2>
        <Separator />
      </div>

      {/* Brands */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" />
            Brands
          </CardTitle>
          <CardDescription>
            Brand voice guidelines, logos, and connected social profiles.
            Each brand has its own tone and editorial direction for content generation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/dashboard/settings/brands">
              Manage Brands
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            Platform Settings
          </CardTitle>
          <CardDescription>
            Character limits, URL handling, tone guidelines, and best practices
            for each social platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/dashboard/settings/platforms">
              View Platform Settings
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Campaign Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Campaign Types
          </CardTitle>
          <CardDescription>
            Type-specific generation rules, scraper strategies, and feedback.
            Controls how content is scraped and generated for each campaign type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/dashboard/settings/campaign-types">
              Manage Campaign Types
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* ── Scheduling & Account ──────────────────────── */}
      <div className="space-y-1 pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Scheduling & Account
        </h2>
        <Separator />
      </div>

      {/* API Key — hidden: Zernio auth is fully server-side via env vars */}

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
            Appearance
          </CardTitle>
          <CardDescription>
            Customize how PolyWiz looks on your device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Timezone
          </CardTitle>
          <CardDescription>
            Set your default timezone for scheduling posts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Default Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Current timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Calendar
          </CardTitle>
          <CardDescription>
            Configure how the calendar displays.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Week starts on</Label>
            <Select
              value={String(weekStartsOn)}
              onValueChange={(v) => setWeekStartsOn(Number(v) as 0 | 1)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your login password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {pwError && <p className="text-sm text-destructive">{pwError}</p>}
            {pwSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Password changed successfully.
              </p>
            )}
            <Button type="submit" variant="outline" disabled={pwLoading}>
              {pwLoading ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Admin: User Management */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              User Management
            </CardTitle>
            <CardDescription>
              Manage team members, reset passwords, and assign brand access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/dashboard/settings/users">
                Manage Users
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LogOut className="h-4 w-4" />
            Session
          </CardTitle>
          <CardDescription>
            Manage your current session on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Sign Out</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign Out</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove your API key from this device. You&apos;ll need
                  to enter it again to use PolyWiz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>
                  Sign Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>PolyWiz — AI-powered campaign scheduler by Polymash</p>
            <p className="mt-1">
              Scheduling powered by{" "}
              <a
                href="https://zernio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Zernio
              </a>
            </p>
            <p className="mt-2">
              <a
                href="https://github.com/JuergenB/polywiz-app"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                View on GitHub
              </a>
              {" · "}
              <a
                href="https://github.com/JuergenB/polywiz-app/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Report Issue
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
