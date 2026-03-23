"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import type { PlatformSetting } from "@/lib/airtable/types";

export default function PlatformSettingsPage() {
  const { data, isLoading } = useQuery<{ settings: PlatformSetting[] }>({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const res = await fetch("/api/platform-settings");
      if (!res.ok) throw new Error("Failed to fetch platform settings");
      return res.json();
    },
  });

  const settings = data?.settings ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Platform Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Best practices and formatting rules for each platform. These guide
            how posts are generated.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 bg-muted rounded w-3/4" />
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {settings.map((setting) => (
            <Card key={setting.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{setting.platformPostType}</span>
                  {setting.maxCharacters && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {setting.maxCharacters.toLocaleString()} chars
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Ideal Length */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Ideal Length
                  </p>
                  <p>{setting.idealLength}</p>
                </div>

                <Separator />

                {/* URL Handling */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    URL Recommendation
                  </p>
                  <p>{setting.urlRecommendation}</p>
                </div>

                <Separator />

                {/* Content Types */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Content Types
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {setting.contentType.map((ct) => (
                      <Badge key={ct} variant="secondary" className="text-xs">
                        {ct}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Tone */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Tone
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {setting.tone.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Use Case */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Primary Use Case
                  </p>
                  <p className="text-muted-foreground">
                    {setting.primaryUseCase}
                  </p>
                </div>

                {/* Hashtag + Video */}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {setting.hashtagLimit && (
                    <span>Hashtags: {setting.hashtagLimit}</span>
                  )}
                  {setting.videoLength && (
                    <span>Video: {setting.videoLength}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
