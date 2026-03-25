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
import { Key, Moon, Sun, Globe, LogOut, ExternalLink, Layers, Palette, Calendar } from "lucide-react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { apiKey, usageStats, logout } = useAuthStore();
  const { timezone, setTimezone, weekStartsOn, setWeekStartsOn } = useAppStore();

  const [showApiKey, setShowApiKey] = useState(false);

  // Compute timezone options - always includes user's browser timezone and current selection
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(timezone),
    [timezone]
  );

  const handleLogout = () => {
    logout();
    router.push("/");
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

      {/* ── Scheduling & Account ──────────────────────── */}
      <div className="space-y-1 pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Scheduling & Account
        </h2>
        <Separator />
      </div>

      {/* API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            API Key
          </CardTitle>
          <CardDescription>
            Your Zernio API key is used to connect to your Zernio account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showApiKey ? "text" : "password"}
                value={showApiKey ? apiKey || "" : maskedApiKey}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

          {usageStats && (
            <div className="rounded-lg bg-muted p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{usageStats.planName}</span>
                <Button variant="link" size="sm" className="h-auto p-0" asChild>
                  <a
                    href="https://zernio.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage Plan
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              </div>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uploads</span>
                  <span>
                    {usageStats.limits.uploads < 0 ? (
                      <>{usageStats.usage.uploads.toLocaleString()} / ∞</>
                    ) : (
                      <>{usageStats.usage.uploads.toLocaleString()} / {usageStats.limits.uploads.toLocaleString()}</>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profiles</span>
                  <span>
                    {usageStats.limits.profiles < 0 ? (
                      <>{usageStats.usage.profiles.toLocaleString()} / ∞</>
                    ) : (
                      <>{usageStats.usage.profiles.toLocaleString()} / {usageStats.limits.profiles.toLocaleString()}</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Button variant="outline" asChild>
            <a
              href="https://zernio.com/dashboard/api-keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Manage API Keys
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

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
                href="https://github.com/JuergenB/social-media-promo-scheduler"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                View on GitHub
              </a>
              {" · "}
              <a
                href="https://github.com/JuergenB/social-media-promo-scheduler/issues"
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
