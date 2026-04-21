"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBrand } from "@/lib/brand-context";
import { CampaignRowActions } from "@/components/campaigns/campaign-row-actions";
import { cn } from "@/lib/utils";
import {
  Megaphone,
  Plus,
  Mail,
  FileText,
  Frame,
  User,
  Mic,
  CalendarDays,
  Landmark,
  Film,
  Building2,
  Sparkles,
  ExternalLink,
  Loader2,
  Eye,
  Calendar,
  CheckCircle2,
  Archive,
} from "lucide-react";
import type { Campaign, CampaignType, CampaignStatus } from "@/lib/airtable/types";

type CampaignView = "active" | "archived" | "all";

const CAMPAIGN_TYPE_ICONS: Record<CampaignType, React.ElementType> = {
  Newsletter: Mail,
  "Blog Post": FileText,
  Exhibition: Frame,
  "Artist Profile": User,
  "Podcast Episode": Mic,
  Event: CalendarDays,
  "Open Call": Megaphone,
  "Public Art": Landmark,
  "Video/Film": Film,
  Institutional: Building2,
  Custom: Sparkles,
};

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Scraping: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Generating: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Review: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Completed: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function getActionLabel(status: CampaignStatus): { label: string; icon: React.ElementType } | null {
  switch (status) {
    case "Draft":
      return { label: "Generate Posts", icon: Sparkles };
    case "Scraping":
    case "Generating":
      return { label: "Generating...", icon: Loader2 };
    case "Review":
      return { label: "Review Posts", icon: Eye };
    case "Active":
      return { label: "View in Calendar", icon: Calendar };
    case "Completed":
      return { label: "View Results", icon: CheckCircle2 };
    case "Archived":
      return { label: "Archived", icon: Archive };
    default:
      return null;
  }
}

export default function CampaignsPage() {
  const { currentBrand } = useBrand();
  const [view, setView] = useState<CampaignView>("active");

  const { data, isLoading } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["campaigns", currentBrand?.id, "all"],
    queryFn: async () => {
      const res = await fetch("/api/campaigns?status=all");
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
  });

  // Filter campaigns by current brand, exclude Quick Posts
  const allCampaigns = data?.campaigns ?? [];
  const brandScoped = (currentBrand
    ? allCampaigns.filter((c) => c.brandIds?.includes(currentBrand.id))
    : allCampaigns
  ).filter((c) => !c.name?.startsWith("Quick Post:"));

  const counts = {
    active: brandScoped.filter((c) => !c.archivedAt).length,
    archived: brandScoped.filter((c) => !!c.archivedAt).length,
    all: brandScoped.length,
  };

  const campaigns =
    view === "active"
      ? brandScoped.filter((c) => !c.archivedAt)
      : view === "archived"
      ? brandScoped.filter((c) => !!c.archivedAt)
      : brandScoped;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          {currentBrand && (
            <p className="text-sm text-muted-foreground mt-1">
              {currentBrand.name}
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/dashboard/campaigns/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Campaign
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b">
        {(["active", "archived", "all"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              view === v
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="capitalize">{v}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">({counts[v]})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse overflow-hidden">
              <div className="h-40 bg-muted" />
              <CardContent className="pt-4 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              {view === "archived" ? (
                <Archive className="h-8 w-8 text-muted-foreground" />
              ) : (
                <Megaphone className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {view === "archived" ? (
              <>
                <h3 className="text-lg font-semibold mb-2">No archived campaigns</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  Campaigns you archive will appear here. Archive one from its
                  overflow menu when you&rsquo;re done with it — it stays
                  available if you want to come back to it later.
                </p>
                {counts.active > 0 && (
                  <Button variant="outline" onClick={() => setView("active")}>
                    View active campaigns
                  </Button>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  Create your first campaign from a newsletter, blog post, or any
                  content worth promoting. You set the direction — the system handles
                  the scheduling.
                </p>
                <Button asChild>
                  <Link href="/dashboard/campaigns/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Campaign
                  </Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {campaigns.map((campaign) => {
            const TypeIcon = CAMPAIGN_TYPE_ICONS[campaign.type] || Sparkles;
            const displayName =
              campaign.name ||
              campaign.url
                .replace(/^https?:\/\//, "")
                .replace(/\/$/, "");

            const action = getActionLabel(campaign.status);
            const ActionIcon = action?.icon;

            return (
              <Link
                key={campaign.id}
                href={`/dashboard/campaigns/${campaign.id}`}
                className="block"
              >
                <Card
                  className="overflow-hidden !py-0 !gap-0 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex">
                    {/* Image — left side, preserves aspect ratio */}
                    {campaign.imageUrl ? (
                      <div className="w-32 sm:w-40 shrink-0 overflow-hidden bg-muted">
                        <img
                          src={campaign.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-32 sm:w-40 shrink-0 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
                        <TypeIcon className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Content — right side */}
                    <div className="flex-1 px-4 py-3 space-y-1.5 min-w-0">
                      {/* Title + status */}
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                          {displayName}
                        </h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-[11px] border-transparent ${STATUS_STYLES[campaign.status] || "bg-zinc-100 text-zinc-600"}`}
                          >
                            {campaign.status}
                          </Badge>
                          <CampaignRowActions campaign={campaign} />
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <TypeIcon className="h-3 w-3" />
                        <span>{campaign.type}</span>
                        <span className="text-border">|</span>
                        <span>{campaign.durationDays}d</span>
                        {campaign.distributionBias && (
                          <>
                            <span className="text-border">|</span>
                            <span>{campaign.distributionBias}</span>
                          </>
                        )}
                      </div>

                      {/* Description / excerpt */}
                      {campaign.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-3">
                          {campaign.description}
                        </p>
                      )}

                      {/* Editorial direction preview */}
                      {campaign.editorialDirection && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
                          &ldquo;{campaign.editorialDirection}&rdquo;
                        </p>
                      )}

                      {/* Action label + source URL row */}
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[10px] text-muted-foreground/50 truncate max-w-[60%] inline-flex items-center gap-1"
                        >
                          {campaign.url.replace(/^https?:\/\//, "").slice(0, 50)}
                          <ExternalLink className="h-2 w-2 shrink-0" />
                        </span>
                        {action && ActionIcon && (
                          <span className="text-[10px] font-medium text-primary inline-flex items-center gap-1 shrink-0">
                            <ActionIcon className={`h-2.5 w-2.5 ${campaign.status === "Scraping" || campaign.status === "Generating" ? "animate-spin" : ""}`} />
                            {action.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
