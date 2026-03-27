"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Save,
  X,
  Pencil,
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
  Code,
  Info,
  List,
  MessageSquare,
  Eye,
} from "lucide-react";
import type {
  CampaignTypeRule,
  GenerationRule,
  FeedbackLogEntry,
  RuleCategory,
  RulePriority,
} from "@/lib/airtable/types";

// ── Icon mapping ────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
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
  Code,
};

function getIcon(iconName: string): React.ElementType {
  return ICON_MAP[iconName] || Sparkles;
}

// ── Constants ───────────────────────────────────────────────────────────

const RULE_CATEGORIES: RuleCategory[] = [
  "Content Pairing",
  "Tone & Voice",
  "Image Handling",
  "Link Handling",
  "Structure",
  "Avoidance",
  "Platform-Specific",
];

const RULE_PRIORITIES: RulePriority[] = ["Critical", "Important", "Nice-to-have"];

const PRIORITY_COLORS: Record<RulePriority, string> = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  Important: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  "Nice-to-have": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const SEVERITY_COLORS: Record<string, string> = {
  Minor: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  Moderate: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  Critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const RESOLUTION_COLORS: Record<string, string> = {
  Pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  "Rule Created": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "Rule Updated": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "Won't Fix": "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

// ── Category display order ──────────────────────────────────────────────

const CATEGORY_ORDER: Record<RuleCategory, number> = {
  "Content Pairing": 0,
  "Tone & Voice": 1,
  Structure: 2,
  "Image Handling": 3,
  "Link Handling": 4,
  Avoidance: 5,
  "Platform-Specific": 6,
};

// ── Types ───────────────────────────────────────────────────────────────

interface FeedbackEntry extends FeedbackLogEntry {
  createdAt: string;
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function CampaignTypesSettingsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse p-6">Loading...</div>}>
      <CampaignTypesContent />
    </Suspense>
  );
}

function CampaignTypesContent() {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ rules: CampaignTypeRule[] }>({
    queryKey: ["campaign-type-rules"],
    queryFn: async () => {
      const res = await fetch("/api/campaign-type-rules");
      if (!res.ok) throw new Error("Failed to fetch campaign type rules");
      return res.json();
    },
  });

  const typeRules = data?.rules ?? [];
  const selectedType = typeRules.find((t) => t.id === selectedId) ?? null;

  // Auto-select type from ?type= URL parameter (e.g., from "View rules" link)
  useEffect(() => {
    const typeSlug = searchParams.get("type");
    if (typeSlug && typeRules.length > 0 && !selectedId) {
      const match = typeRules.find((t) => t.slug === typeSlug);
      if (match) setSelectedId(match.id);
    }
  }, [searchParams, typeRules, selectedId]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaign Types</h1>
          <p className="text-sm text-muted-foreground">
            Campaign type rules, generation rules, and feedback. These control
            how content is scraped and generated for each campaign type.
          </p>
        </div>
      </div>

      {/* Tile Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 rounded-lg border p-3 animate-pulse"
            >
              <div className="h-5 w-5 bg-muted rounded" />
              <div className="h-3 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {typeRules.map((typeRule) => {
            const TypeIcon = getIcon(typeRule.icon);
            const isSelected = selectedId === typeRule.id;
            const isActive = typeRule.status === "Active";
            const isComingSoon = typeRule.status === "Coming Soon";

            return (
              <button
                key={typeRule.id}
                type="button"
                onClick={() =>
                  setSelectedId(isSelected ? null : typeRule.id)
                }
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                  isSelected
                    ? "border-primary bg-primary/5 text-primary"
                    : isActive
                      ? "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      : "border-border/50 text-muted-foreground/50 opacity-60 hover:opacity-80 hover:border-border"
                )}
              >
                <TypeIcon className="h-5 w-5" />
                <span className="text-center leading-tight">
                  {typeRule.name}
                </span>
                {/* Status indicator */}
                {isActive && !isSelected && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                )}
                {isComingSoon && (
                  <span className="absolute top-1 right-1 text-[9px] text-muted-foreground/60 font-normal">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {selectedType && <DetailPanel typeRule={selectedType} />}
    </div>
  );
}

// ── Detail Panel ────────────────────────────────────────────────────────

function DetailPanel({ typeRule }: { typeRule: CampaignTypeRule }) {
  // Fetch generation rules for this type
  const { data: rulesData } = useQuery<{ rules: GenerationRule[] }>({
    queryKey: ["generation-rules", typeRule.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/generation-rules?campaignTypeId=${typeRule.id}`
      );
      if (!res.ok) throw new Error("Failed to fetch generation rules");
      return res.json();
    },
  });

  const rules = rulesData?.rules ?? [];
  const activeRuleCount = rules.filter((r) => r.active).length;
  const TypeIcon = getIcon(typeRule.icon);

  return (
    <Card>
      {/* Panel header */}
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{typeRule.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  typeRule.status === "Active"
                    ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                    : typeRule.status === "Coming Soon"
                      ? "border-blue-500/50 text-blue-600 dark:text-blue-400"
                      : "border-zinc-400 text-zinc-500"
                )}
              >
                {typeRule.status}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {typeRule.scraperStrategy}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {activeRuleCount} active rule
                {activeRuleCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Tabbed content */}
      <CardContent className="pt-0">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <Info className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="rules">
              <List className="h-3.5 w-3.5" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="feedback">
              <MessageSquare className="h-3.5 w-3.5" />
              Feedback
            </TabsTrigger>
            <TabsTrigger value="prompt">
              <Eye className="h-3.5 w-3.5" />
              AI Instructions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab typeRule={typeRule} />
          </TabsContent>

          <TabsContent value="rules" className="mt-4">
            <RulesTab typeRule={typeRule} rules={rules} />
          </TabsContent>

          <TabsContent value="feedback" className="mt-4">
            <FeedbackTab typeRule={typeRule} />
          </TabsContent>

          <TabsContent value="prompt" className="mt-4">
            <PromptPreviewTab rules={rules} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({ typeRule }: { typeRule: CampaignTypeRule }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    description: typeRule.description,
    contentStructure: typeRule.contentStructure || "",
    urlPlaceholder: typeRule.urlPlaceholder || "",
  });

  // Reset draft when typeRule changes (user selects different type)
  const [prevId, setPrevId] = useState(typeRule.id);
  if (prevId !== typeRule.id) {
    setPrevId(typeRule.id);
    setEditing(false);
    setDraft({
      description: typeRule.description,
      contentStructure: typeRule.contentStructure || "",
      urlPlaceholder: typeRule.urlPlaceholder || "",
    });
  }

  const mutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const res = await fetch(`/api/campaign-type-rules/${typeRule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-type-rules"] });
      setEditing(false);
      toast.success("Type info updated");
    },
    onError: () => {
      toast.error("Failed to update type info");
    },
  });

  const handleCancel = () => {
    setDraft({
      description: typeRule.description,
      contentStructure: typeRule.contentStructure || "",
      urlPlaceholder: typeRule.urlPlaceholder || "",
    });
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Type Info
        </h4>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => mutation.mutate(draft)}
              disabled={mutation.isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Description
          </Label>
          {editing ? (
            <Textarea
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              rows={3}
              className="text-sm"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {typeRule.description || "No description set."}
            </p>
          )}
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Content Structure
          </Label>
          {editing ? (
            <Textarea
              value={draft.contentStructure}
              onChange={(e) =>
                setDraft({ ...draft, contentStructure: e.target.value })
              }
              rows={4}
              className="text-sm font-mono"
              placeholder="Describe the expected structure of scraped content..."
            />
          ) : (
            <div className="text-sm text-muted-foreground whitespace-pre-line bg-muted/50 rounded-lg p-3 max-h-40 overflow-y-auto">
              {typeRule.contentStructure || "Not specified."}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">
            URL Placeholder
          </Label>
          {editing ? (
            <Input
              value={draft.urlPlaceholder}
              onChange={(e) =>
                setDraft({ ...draft, urlPlaceholder: e.target.value })
              }
              className="text-sm"
              placeholder="e.g. https://example.com/blog/..."
            />
          ) : (
            <code className="text-xs bg-muted px-2 py-1 rounded">
              {typeRule.urlPlaceholder || "Not set"}
            </code>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Rules Tab ───────────────────────────────────────────────────────────

function RulesTab({
  typeRule,
  rules,
}: {
  typeRule: CampaignTypeRule;
  rules: GenerationRule[];
}) {
  const queryClient = useQueryClient();
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Group rules by category
  const groupedRules = useMemo(() => {
    const groups = new Map<RuleCategory, GenerationRule[]>();
    for (const rule of rules) {
      const existing = groups.get(rule.category) || [];
      existing.push(rule);
      groups.set(rule.category, existing);
    }
    return [...groups.entries()].sort(
      ([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
    );
  }, [rules]);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/generation-rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error("Failed to toggle rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["generation-rules", typeRule.id],
      });
    },
    onError: () => {
      toast.error("Failed to toggle rule");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Generation Rules
        </h4>
        <span className="text-xs text-muted-foreground">
          {rules.filter((r) => r.active).length} active / {rules.length} total
        </span>
      </div>

      {groupedRules.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No generation rules defined for this type.
        </p>
      ) : (
        <div className="space-y-4">
          {groupedRules.map(([category, categoryRules]) => (
            <div key={category}>
              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {category}
              </h5>
              <div className="space-y-1">
                {categoryRules.map((rule) => (
                  <div key={rule.id} className="rounded-md border">
                    {/* Rule summary row */}
                    <div
                      className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() =>
                        setExpandedRuleId(
                          expandedRuleId === rule.id ? null : rule.id
                        )
                      }
                    >
                      <div
                        className="pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={rule.active}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({
                              id: rule.id,
                              active: !!checked,
                            })
                          }
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              !rule.active &&
                                "line-through text-muted-foreground"
                            )}
                          >
                            {rule.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1.5",
                              PRIORITY_COLORS[rule.priority]
                            )}
                          >
                            {rule.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {rule.ruleText}
                        </p>
                      </div>
                    </div>

                    {/* Expanded rule detail */}
                    {expandedRuleId === rule.id && (
                      <div className="px-3 pb-3 pt-1 border-t bg-muted/30 space-y-2">
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">
                            Full Rule Text
                          </Label>
                          <p className="text-sm mt-1">{rule.ruleText}</p>
                        </div>
                        {rule.promptFragment &&
                          rule.promptFragment !== rule.ruleText && (
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">
                                Prompt Fragment
                              </Label>
                              <p className="text-sm mt-1 font-mono bg-muted rounded px-2 py-1">
                                {rule.promptFragment}
                              </p>
                            </div>
                          )}
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            Source: {rule.source}
                          </Badge>
                          {rule.createdFromFeedbackIds.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              From feedback
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Rule */}
      {showAddForm ? (
        <AddRuleForm
          typeRuleId={typeRule.id}
          onClose={() => setShowAddForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Rule
        </Button>
      )}
    </div>
  );
}

// ── Add Rule Form ───────────────────────────────────────────────────────

function AddRuleForm({
  typeRuleId,
  onClose,
}: {
  typeRuleId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<RuleCategory>("Structure");
  const [ruleText, setRuleText] = useState("");
  const [priority, setPriority] = useState<RulePriority>("Nice-to-have");
  const [active, setActive] = useState(true);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/generation-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          campaignTypeIds: [typeRuleId],
          category,
          ruleText,
          priority,
          active,
          source: "Manual",
        }),
      });
      if (!res.ok) throw new Error("Failed to create rule");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["generation-rules", typeRuleId],
      });
      toast.success("Rule created");
      onClose();
    },
    onError: () => {
      toast.error("Failed to create rule");
    },
  });

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <h5 className="text-sm font-semibold">New Generation Rule</h5>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div>
        <Label className="text-xs">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name..."
          className="text-sm mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Category</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as RuleCategory)}
          >
            <SelectTrigger className="text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as RulePriority)}
          >
            <SelectTrigger className="text-sm mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Rule Text</Label>
        <Textarea
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          rows={3}
          placeholder="What should the AI do or avoid..."
          className="text-sm mt-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="active-toggle"
          checked={active}
          onCheckedChange={(checked) => setActive(!!checked)}
        />
        <Label htmlFor="active-toggle" className="text-sm">
          Active
        </Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={!name || !ruleText || mutation.isPending}
        >
          {mutation.isPending ? "Creating..." : "Create Rule"}
        </Button>
      </div>
    </div>
  );
}

// ── Feedback Tab ────────────────────────────────────────────────────────

function FeedbackTab({ typeRule }: { typeRule: CampaignTypeRule }) {
  const { data } = useQuery<{ entries: FeedbackEntry[] }>({
    queryKey: ["feedback", typeRule.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/feedback?campaignTypeId=${typeRule.id}`
      );
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json();
    },
  });

  const entries = data?.entries ?? [];

  // Count by issue category
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const cat of entry.issueCategories) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    return [...counts.entries()].sort(([, a], [, b]) => b - a);
  }, [entries]);

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground">
        Recent Feedback (90 days)
      </h4>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No feedback recorded for this type.
        </p>
      ) : (
        <>
          {/* Category badges with counts */}
          <div className="flex flex-wrap gap-2">
            {categoryCounts.map(([cat, count]) => (
              <Badge key={cat} variant="secondary" className="text-xs">
                {cat} ({count})
              </Badge>
            ))}
          </div>

          {/* Feedback list */}
          <div className="space-y-2">
            {entries.slice(0, 10).map((entry) => (
              <div
                key={entry.id}
                className="rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{entry.summary}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] px-1.5",
                      SEVERITY_COLORS[entry.severity]
                    )}
                  >
                    {entry.severity}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] px-1.5",
                      RESOLUTION_COLORS[entry.resolution]
                    )}
                  >
                    {entry.resolution}
                  </Badge>
                </div>
                {entry.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {entry.description}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(entry.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Prompt Preview Tab ──────────────────────────────────────────────────

function PromptPreviewTab({ rules }: { rules: GenerationRule[] }) {
  const activeRules = rules.filter((r) => r.active);

  const promptText = useMemo(() => {
    if (activeRules.length === 0)
      return "No active rules to compose a prompt from.";

    const grouped = new Map<RuleCategory, GenerationRule[]>();
    for (const rule of activeRules) {
      const existing = grouped.get(rule.category) || [];
      existing.push(rule);
      grouped.set(rule.category, existing);
    }

    const sortedCategories = [...grouped.entries()].sort(
      ([a], [b]) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99)
    );

    const sections: string[] = [];
    for (const [category, categoryRules] of sortedCategories) {
      const priorityOrder: Record<string, number> = {
        Critical: 0,
        Important: 1,
        "Nice-to-have": 2,
      };
      const sorted = [...categoryRules].sort(
        (a, b) =>
          (priorityOrder[a.priority] ?? 9) -
          (priorityOrder[b.priority] ?? 9)
      );
      const ruleLines = sorted.map((r) => {
        const text = r.promptFragment || r.ruleText;
        const priorityTag = r.priority === "Critical" ? " [CRITICAL]" : "";
        return `- ${text}${priorityTag}`;
      });
      sections.push(
        `<category name="${category}">\n${ruleLines.join("\n")}\n</category>`
      );
    }

    return `<campaign_type_rules>\nThese rules are specific to this campaign type. Follow them in addition to the general rules above.\n\n${sections.join("\n\n")}\n</campaign_type_rules>`;
  }, [activeRules]);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">
        AI Instructions Preview
      </h4>
      <p className="text-xs text-muted-foreground">
        This is the type-specific instruction block injected into the AI system prompt during generation. It&apos;s composed from the active rules above. Brand voice and scraped content are added separately per campaign.
      </p>
      <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">
        {promptText}
      </pre>
    </div>
  );
}
