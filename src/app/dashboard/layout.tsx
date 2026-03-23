"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useAppStore } from "@/stores";
import { useProfiles } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Logo, ErrorBoundary } from "@/components/shared";
import {
  LayoutDashboard,
  PenSquare,
  Calendar,
  Users,
  ListOrdered,
  Megaphone,
  Settings,
  Layers,
  Palette,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
  ChevronRight,
  Check,
  ExternalLink,
} from "lucide-react";

const campaignNav = [
  {
    label: "Campaigns",
    href: "/dashboard/campaigns",
    icon: Megaphone,
  },
];

const schedulingNav = [
  {
    label: "Compose",
    href: "/dashboard/compose",
    icon: PenSquare,
  },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    icon: Calendar,
  },
  {
    label: "Queue",
    href: "/dashboard/queue",
    icon: ListOrdered,
  },
  {
    label: "Accounts",
    href: "/dashboard/accounts",
    icon: Users,
  },
];

const settingsSubNav = [
  {
    label: "General",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    label: "Brands",
    href: "/dashboard/settings/brands",
    icon: Palette,
  },
  {
    label: "Platforms",
    href: "/dashboard/settings/platforms",
    icon: Layers,
  },
];

// Flat list for mobile bottom bar (limited space)
const mobileNav = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
  { label: "Compose", href: "/dashboard/compose", icon: PenSquare },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Queue", href: "/dashboard/queue", icon: ListOrdered },
];

function NavLink({
  href,
  icon: Icon,
  label,
  pathname,
  indent = false,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  pathname: string;
  indent?: boolean;
}) {
  const isActive =
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        indent && "pl-6",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      {children}
    </p>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { defaultProfileId, setDefaultProfileId } = useAppStore();
  const { theme, setTheme } = useTheme();
  const { data: profilesData } = useProfiles();
  const settingsOpen = pathname.startsWith("/dashboard/settings");

  const profiles = profilesData?.profiles || [];
  const currentProfile = profiles.find((p: any) => p._id === defaultProfileId) || profiles[0];

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Desktop only */}
      <aside className="hidden lg:flex w-56 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-border px-4">
          <Logo size="sm" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* Dashboard */}
          <NavLink
            href="/dashboard"
            icon={LayoutDashboard}
            label="Dashboard"
            pathname={pathname}
          />

          {/* Campaigns section */}
          <SectionLabel>Campaigns</SectionLabel>
          <div className="space-y-0.5">
            {campaignNav.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </div>

          {/* Scheduling section (from LateWiz) */}
          <SectionLabel>Scheduling</SectionLabel>
          <div className="space-y-0.5">
            {schedulingNav.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} />
            ))}
          </div>

          {/* Settings section — expandable */}
          <SectionLabel>Settings</SectionLabel>
          <div className="space-y-0.5">
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                settingsOpen
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="flex-1">Settings</span>
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  settingsOpen && "rotate-90"
                )}
              />
            </Link>
            {settingsOpen && (
              <div className="space-y-0.5">
                {settingsSubNav.map((item) => (
                  <NavLink
                    key={item.href}
                    {...item}
                    pathname={pathname}
                    indent
                  />
                ))}
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-3">
            {/* Logo on mobile (since sidebar is hidden) */}
            <div className="lg:hidden">
              <Logo size="sm" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Profile Selector */}
            {profiles.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: currentProfile?.color || '#888' }}
                    />
                    <span className="max-w-24 truncate">
                      {currentProfile?.name || 'Select Profile'}
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Switch Profile</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {profiles.map((profile: any) => (
                    <DropdownMenuItem
                      key={profile._id}
                      onClick={() => setDefaultProfileId(profile._id)}
                      className="gap-2"
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: profile.color || '#888' }}
                      />
                      <span className="flex-1 truncate">{profile.name}</span>
                      {profile._id === defaultProfileId && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Separator orientation="vertical" className="h-6" />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="text-sm">{session?.user?.name || "User"}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">
                  {session?.user?.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="text-sm">
                  <a
                    href="https://zernio.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Zernio Dashboard
                    <ExternalLink className="ml-auto h-3 w-3" />
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-sm">
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-3 w-3" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-sm text-destructive">
                  <LogOut className="mr-2 h-3 w-3" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-safe lg:hidden">
        <div className="flex h-16 items-center justify-around px-2">
          {mobileNav.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
