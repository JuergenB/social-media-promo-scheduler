"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useAppStore } from "@/stores";
import { useProfiles } from "@/hooks";
import { useBrand } from "@/lib/brand-context";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo, ErrorBoundary } from "@/components/shared";
import {
  LayoutDashboard,
  PenSquare,
  Calendar,
  Users,
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
  BarChart3,
  MoreHorizontal,
} from "lucide-react";

const mainNav = [
  { label: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
  { label: "Quick Post", href: "/dashboard/quick-post", icon: PenSquare },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, disabled: true },
];

const settingsSubNav = [
  {
    label: "General",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    label: "Brand Settings",
    href: "/dashboard/settings/brands",
    icon: Palette,
  },
  {
    label: "Campaign Types",
    href: "/dashboard/settings/campaign-types",
    icon: Megaphone,
  },
  {
    label: "Accounts",
    href: "/dashboard/accounts",
    icon: Users,
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
  { label: "Quick Post", href: "/dashboard/quick-post", icon: PenSquare },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
];

function NavLink({
  href,
  icon: Icon,
  label,
  pathname,
  indent = false,
  disabled = false,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  pathname: string;
  indent?: boolean;
  disabled?: boolean;
}) {
  const isActive =
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  if (disabled) {
    return (
      <span
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/40 cursor-not-allowed",
          indent && "pl-6",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
        <span className="ml-auto text-[9px] uppercase tracking-wider opacity-60">Soon</span>
      </span>
    );
  }

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
  const { currentBrand, brands, isLoading: isBrandLoading, switchBrand } = useBrand();
  const isOnSettingsPage = pathname.startsWith("/dashboard/settings");
  const [settingsExpanded, setSettingsExpanded] = useState(isOnSettingsPage);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Auto-expand when navigating to a settings page
  useEffect(() => {
    if (isOnSettingsPage) setSettingsExpanded(true);
  }, [isOnSettingsPage]);
  const settingsOpen = settingsExpanded;

  const profiles = profilesData?.profiles || [];
  const currentProfile = profiles.find((p: any) => p._id === defaultProfileId) || profiles[0];

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop only */}
      <aside className="hidden lg:flex w-56 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-border px-4">
          <Logo size="sm" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-0.5">
            <NavLink
              href="/dashboard"
              icon={LayoutDashboard}
              label="Dashboard"
              pathname={pathname}
            />
            {mainNav.map((item) => (
              <NavLink key={item.href} {...item} pathname={pathname} disabled={item.disabled} />
            ))}
          </div>
        </nav>

        {/* Settings — pinned to bottom */}
        <div className="border-t border-border p-2">
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setSettingsExpanded((v) => !v)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full",
                settingsOpen
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Settings</span>
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  settingsOpen && "rotate-90"
                )}
              />
            </button>
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
        </div>
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

            {/* Brand Switcher */}
            {isBrandLoading ? (
              <div className="flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-muted/50 animate-pulse">
                <div className="h-4 w-4 rounded-sm bg-muted-foreground/20" />
                <div className="hidden sm:block h-3 w-20 rounded bg-muted-foreground/20" />
              </div>
            ) : brands.length > 0 && mounted ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    {currentBrand?.logoUrl ? (
                      <img
                        src={currentBrand.logoUrl}
                        alt=""
                        className="h-4 w-4 rounded-sm object-contain"
                      />
                    ) : (
                      <Palette className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline max-w-32 truncate text-sm">
                      {currentBrand?.name || "Select Brand"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Switch Brand</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {brands.map((brand) => (
                    <DropdownMenuItem
                      key={brand.id}
                      onClick={() => switchBrand(brand.id)}
                      className="gap-2"
                    >
                      {brand.logoUrl ? (
                        <img
                          src={brand.logoUrl}
                          alt=""
                          className="h-4 w-4 rounded-sm object-contain"
                        />
                      ) : (
                        <Palette className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate">{brand.name}</span>
                      {brand.id === currentBrand?.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {/* Profile Selector */}
            {profiles.length > 1 && mounted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: currentProfile?.color || '#888' }}
                    />
                    <span className="hidden sm:inline max-w-24 truncate">
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
              {mounted && theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {mounted && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="hidden sm:inline text-sm">{session?.user?.name || "User"}</span>
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
            </DropdownMenu>}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden w-full p-2 pb-20 sm:p-4 sm:pb-20 lg:p-6 lg:pb-6">
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

          {/* More tab — opens sheet with Accounts + Settings */}
          {mounted && <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors",
                  (pathname.startsWith("/dashboard/accounts") || pathname.startsWith("/dashboard/settings"))
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl pb-safe">
              <SheetHeader className="pb-2">
                <SheetTitle className="text-sm">More</SheetTitle>
              </SheetHeader>
              <div className="space-y-1">
                <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Settings
                </div>
                {settingsSubNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreSheetOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                      (pathname === item.href || pathname.startsWith(item.href + "/"))
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>}
        </div>
      </nav>
    </div>
  );
}
