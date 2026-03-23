"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Save,
  X,
  Globe,
  Mail,
} from "lucide-react";
import type { Brand } from "@/lib/airtable/types";

function BrandCard({ brand }: { brand: Brand }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: brand.name,
    websiteUrl: brand.websiteUrl,
    newsletterUrl: brand.newsletterUrl,
    voiceGuidelines: brand.voiceGuidelines,
  });

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: brand.id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update brand");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brands"] });
      setEditing(false);
      toast.success("Brand updated");
    },
    onError: () => {
      toast.error("Failed to update brand");
    },
  });

  const handleSave = () => {
    mutation.mutate(draft);
  };

  const handleCancel = () => {
    setDraft({
      name: brand.name,
      websiteUrl: brand.websiteUrl,
      newsletterUrl: brand.newsletterUrl,
      voiceGuidelines: brand.voiceGuidelines,
    });
    setEditing(false);
  };

  return (
    <Card className="overflow-hidden !pt-0 !gap-0">
      {/* Dark header with logo */}
      <div className="bg-zinc-900 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-5">
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              className="h-14 w-auto max-w-[160px] object-contain rounded"
            />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-zinc-700 flex items-center justify-center text-zinc-300 text-xl font-bold">
              {brand.name.charAt(0)}
            </div>
          )}
          <div>
            <h3 className="text-xl font-semibold text-white">{brand.name}</h3>
            {brand.websiteUrl && (
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                {brand.websiteUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              brand.status === "Active"
                ? "border-emerald-500/50 text-emerald-400"
                : "border-zinc-600 text-zinc-400"
            }
          >
            {brand.status}
          </Badge>
          {!editing ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                onClick={handleCancel}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSave}
                disabled={mutation.isPending}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {mutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <CardContent className="p-6 space-y-5">
        {/* URLs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Globe className="h-3 w-3" />
              Website
            </Label>
            {editing ? (
              <Input
                value={draft.websiteUrl}
                onChange={(e) =>
                  setDraft({ ...draft, websiteUrl: e.target.value })
                }
                placeholder="https://..."
                className="text-sm"
              />
            ) : (
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                {brand.websiteUrl || "—"}
                {brand.websiteUrl && <ExternalLink className="h-3 w-3" />}
              </a>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <Mail className="h-3 w-3" />
              Newsletter
            </Label>
            {editing ? (
              <Input
                value={draft.newsletterUrl}
                onChange={(e) =>
                  setDraft({ ...draft, newsletterUrl: e.target.value })
                }
                placeholder="https://..."
                className="text-sm"
              />
            ) : (
              <a
                href={brand.newsletterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                {brand.newsletterUrl || "—"}
                {brand.newsletterUrl && <ExternalLink className="h-3 w-3" />}
              </a>
            )}
          </div>
        </div>

        {/* Zernio Profile */}
        {brand.zernioProfileId && (
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Zernio Profile ID
            </Label>
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {brand.zernioProfileId}
            </code>
          </div>
        )}

        <Separator />

        {/* Voice Guidelines */}
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
            Voice Guidelines
          </Label>
          {editing ? (
            <Textarea
              value={draft.voiceGuidelines}
              onChange={(e) =>
                setDraft({ ...draft, voiceGuidelines: e.target.value })
              }
              rows={12}
              className="text-sm leading-relaxed"
              placeholder="Describe the brand voice, tone, audience, and content guidelines..."
            />
          ) : brand.voiceGuidelines ? (
            <div className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto">
              {brand.voiceGuidelines}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No voice guidelines set. Click Edit to add them.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function BrandsSettingsPage() {
  const { data, isLoading } = useQuery<{ brands: Brand[] }>({
    queryKey: ["brands"],
    queryFn: async () => {
      const res = await fetch("/api/brands");
      if (!res.ok) throw new Error("Failed to fetch brands");
      return res.json();
    },
  });

  const brands = data?.brands ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
          <p className="text-sm text-muted-foreground">
            Voice guidelines, logos, and connected profiles for each brand.
            These shape how campaign content is generated.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse overflow-hidden">
              <div className="bg-zinc-900 h-20" />
              <CardContent className="p-6 space-y-3">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} />
          ))}
        </div>
      )}
    </div>
  );
}
