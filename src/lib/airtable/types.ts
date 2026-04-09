// Airtable record types for the Social Media Promo Scheduler base

export interface Brand {
  id: string;
  name: string;
  websiteUrl: string;
  zernioApiKeyLabel: string;
  zernioProfileId: string;
  voiceGuidelines: string;
  newsletterUrl: string;
  logoUrl: string | null;
  /** Short.io domain for this brand (e.g., "jb9.me"). Falls back to SHORT_IO_DOMAIN env var. */
  shortDomain: string | null;
  /** Env var name for this brand's Short.io API key (e.g., "SHORT_IO_KEY_INTERSECT"). Falls back to SHORT_IO_API_KEY. */
  shortApiKeyLabel: string | null;
  /** Env var name for this brand's Anthropic API key (e.g., "ANTHROPIC_KEY_INTERSECT"). Falls back to ANTHROPIC_API_KEY. */
  anthropicApiKeyLabel: string | null;
  /** IANA timezone for scheduling (e.g. "America/New_York"). */
  timezone: string | null;
  /** JSON: per-platform posting cadence preferences. */
  platformCadence: PlatformCadenceConfig | null;
  /** Instagram handle including @ (e.g., "@notrealartworld"). */
  instagramHandle: string | null;
  /** Vercel Blob URL for white/light transparent PNG logo (for dark backgrounds). */
  logoTransparentLight: string | null;
  /** Vercel Blob URL for dark/black transparent PNG logo (for light backgrounds). */
  logoTransparentDark: string | null;
  /** Per-brand tone dimension settings (8 dimensions, 1-10 scale each). */
  toneDimensions?: ToneDimensions;
  /** Short additional tone notes (1-2 sentences). */
  toneNotes?: string;
  /** Default overall voice intensity (0-100). 0=Professional, 50=Balanced, 100=Full Voice. */
  defaultVoiceIntensity?: number;
  status: "Active" | "Inactive";
}

// ── Per-brand tone dimensions ────────────────────────────────────────

export interface ToneDimensions {
  wit: number;
  warmth: number;
  opinion: number;
  skepticism: number;
  playfulness: number;
  urgency: number;
  authority: number;
  intimacy: number;
}

export const TONE_DIMENSION_DEFS: Array<{
  key: keyof ToneDimensions;
  label: string;
  lowLabel: string;
  highLabel: string;
  description: string;
}> = [
  { key: "wit", label: "Wit", lowLabel: "Straightforward", highLabel: "Sharp & ironic", description: "Clever wordplay, dry humor, ironic observations" },
  { key: "warmth", label: "Warmth", lowLabel: "Formal", highLabel: "Personal", description: "How inviting and familiar the voice feels" },
  { key: "opinion", label: "Opinion", lowLabel: "Neutral", highLabel: "Strong positions", description: "Whether the voice hedges or takes clear stances" },
  { key: "skepticism", label: "Skepticism", lowLabel: "Accepting", highLabel: "Questions everything", description: "Healthy questioning of trends, hype, and conventional wisdom" },
  { key: "playfulness", label: "Playfulness", lowLabel: "Serious", highLabel: "Irreverent", description: "Lighthearted energy, fun asides, willingness to not take itself too seriously" },
  { key: "urgency", label: "Urgency", lowLabel: "Relaxed", highLabel: "Action-oriented", description: "How strongly posts push toward action, deadlines, or FOMO" },
  { key: "authority", label: "Authority", lowLabel: "Exploratory", highLabel: "Expert", description: "Commanding expertise vs. humble curiosity" },
  { key: "intimacy", label: "Intimacy", lowLabel: "Institutional", highLabel: "First-person", description: "Personal, confessional voice vs. organizational distance" },
];

// ── Per-brand platform cadence ────────────────────────────────────────

export type TimeWindow = "morning" | "afternoon" | "evening";

export interface PlatformCadenceEntry {
  postsPerWeek: number;
  /** Days of week: 0=Sun … 6=Sat. Empty = all days. */
  activeDays: number[];
  /** Which time-of-day windows to use. Maps to platform-specific hours. */
  timeWindows: TimeWindow[];
}

/** Platform ID → cadence config. Missing platforms inherit global defaults. */
export type PlatformCadenceConfig = Record<string, PlatformCadenceEntry>;

export const CAMPAIGN_TYPES = [
  "Newsletter",
  "Blog Post",
  "Exhibition",
  "Artist Profile",
  "Podcast Episode",
  "Event",
  "Open Call",
  "Public Art",
  "Video/Film",
  "Institutional",
  "Custom",
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

/** Campaign types with generation pipeline implemented */
export const ENABLED_CAMPAIGN_TYPES: CampaignType[] = ["Newsletter", "Blog Post", "Event", "Exhibition", "Artist Profile", "Podcast Episode"];

export const CAMPAIGN_STATUSES = [
  "Draft",
  "Scraping",
  "Generating",
  "Review",
  "Active",
  "Completed",
  "Archived",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const DISTRIBUTION_BIASES = [
  "Front-loaded",
  "Balanced",
  "Back-loaded",
] as const;

export type DistributionBias = (typeof DISTRIBUTION_BIASES)[number];

export interface Campaign {
  id: string;
  name: string;
  /** Page excerpt / og:description extracted during creation */
  description: string;
  url: string;
  type: CampaignType;
  brandIds: string[];
  durationDays: number;
  distributionBias: DistributionBias;
  editorialDirection: string;
  imageUrl: string;
  status: CampaignStatus;
  createdAt: string;
  createdBy: string;
  /** Event/Open Call: the target date (event date or submission deadline) */
  eventDate?: string;
  /** Event/Open Call: user-supplied details (location, tickets, eligibility, etc.) */
  eventDetails?: string;
  /** Additional source URLs (one per line) for supplemental scraping */
  additionalUrls?: string;
  /** When to start posting (ISO date string). Defaults to today if not set. */
  startDate?: string;
  /** Comma-separated platform keys for generation (e.g. "instagram,twitter,linkedin") */
  targetPlatforms?: string[];
  /** Max post variants per platform (null = Auto) */
  maxVariantsPerPlatform?: number | null;
  /** Per-campaign platform cadence overrides. Seeded from brand defaults on creation. */
  platformCadence?: PlatformCadenceConfig | null;
  /** Tone of voice intensity (0-100). 0=Professional, 50=Balanced (default), 100=Full Voice. */
  voiceIntensity?: number;
  /** Images scraped during campaign generation — JSON array of { url, alt, storyTitle? } */
  scrapedImages?: Array<{ url: string; alt: string; storyTitle?: string }>;
  /** Artist Profile: Instagram handle of the featured artist (without @) */
  artistHandle?: string;
}

export const POST_STATUSES = [
  "Pending",
  "Approved",
  "Modified",
  "Dismissed",
  "Queued",
  "Scheduled",
  "Published",
  "Failed",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export interface Post {
  id: string;
  title: string;
  campaignIds: string[];
  platform: string;
  content: string;
  mediaUrls: string;
  mediaCaptions: string;
  imageUrl: string;
  shortUrl: string;
  linkUrl: string;
  scheduledDate: string;
  status: PostStatus;
  contentVariant: string;
  approvedBy: string;
  approvedAt: string;
  zernioPostId: string;
  notes: string;
  originalMedia: string;
  coverSlideData: string;
  /** First comment text (hashtags + engagement hook for Instagram/Facebook/LinkedIn) */
  firstComment: string;
  /** User-defined display/scheduling priority (lower = earlier). Null = auto-order by createdAt. */
  sortOrder: number | null;
  /** Airtable record creation timestamp (ISO 8601) */
  createdAt?: string;
}

export interface PlatformSetting {
  id: string;
  platformPostType: string;
  maxCharacters: number | null;
  idealLength: string;
  urlHandling: string;
  urlRecommendation: string;
  contentType: string[];
  tone: string[];
  primaryUseCase: string;
  engagementNotes: string;
  hashtagLimit: string;
  videoLength: string;
  firstCommentStrategy: string;
}

export interface ImageSize {
  id: string;
  label: string;
  platform: string;
  imageType: string;
  preferredWidth: number;
  preferredHeight: number;
  aspectRatio: string;
  fileType: string;
  croppingNotes: string;
  maxFileSize: number | null;
  additionalGuidelines: string;
  useCaseTags: string[];
  aiNotesSummary: string;
}

// ── Campaign Type Rules (Airtable-driven, replaces hardcoded constants) ──

export type CampaignTypeStatus = "Active" | "Coming Soon" | "Disabled";

export type ScraperStrategy =
  | "blog-post"
  | "newsletter"
  | "event"
  | "open-call"
  | "html-structured"
  | "api-fetch"
  | "manual";

export interface CampaignTypeRule {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  status: CampaignTypeStatus;
  scraperStrategy: ScraperStrategy;
  scraperConfig: string | null;
  contentStructure: string | null;
  urlPlaceholder: string | null;
  sortOrder: number;
}

// ── Generation Rules ─────────────────────────────────────────────────────

export type RuleCategory =
  | "Content Pairing"
  | "Tone & Voice"
  | "Image Handling"
  | "Link Handling"
  | "Structure"
  | "Avoidance"
  | "Platform-Specific";

export type RulePriority = "Critical" | "Important" | "Nice-to-have";

export type RuleSource = "Manual" | "Feedback-derived" | "Onboarding";

export interface GenerationRule {
  id: string;
  name: string;
  campaignTypeIds: string[];
  category: RuleCategory;
  ruleText: string;
  promptFragment: string | null;
  priority: RulePriority;
  active: boolean;
  source: RuleSource;
  createdFromFeedbackIds: string[];
}

// ── Feedback Log ─────────────────────────────────────────────────────────

export const FEEDBACK_CATEGORIES = [
  "Wrong Image Pairing",
  "Wrong Tone",
  "Wrong Artist",
  "Too Generic",
  "Wrong Length",
  "Missing Context",
  "Factual Error",
  "Banned Word Used",
  "Wrong Platform Style",
  "Other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export type FeedbackSeverity = "Minor" | "Moderate" | "Critical";

export type FeedbackResolution =
  | "Pending"
  | "Rule Created"
  | "Rule Updated"
  | "Won't Fix";

export interface FeedbackLogEntry {
  id: string;
  summary: string;
  campaignIds: string[];
  postIds: string[];
  campaignTypeIds: string[];
  issueCategories: FeedbackCategory[];
  description: string;
  severity: FeedbackSeverity;
  resolution: FeedbackResolution;
  resolvedByRuleIds: string[];
}

// ── User Profile (Users table — brand access mapping) ────────────────────────

export type UserRole = "super-admin" | "admin" | "curator" | "viewer";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  brandIds: string[];
  defaultBrandId: string | null;
}

// Duration presets for campaign creation
export const DURATION_PRESETS = [
  { label: "Sprint", days: 14, description: "2 weeks", defaultBias: "Front-loaded" as DistributionBias },
  { label: "Standard", days: 90, description: "3 months", defaultBias: "Front-loaded" as DistributionBias },
  { label: "Evergreen", days: 180, description: "6 months", defaultBias: "Front-loaded" as DistributionBias },
  { label: "Marathon", days: 365, description: "12 months", defaultBias: "Balanced" as DistributionBias },
] as const;
