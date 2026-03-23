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
  status: "Active" | "Inactive";
}

export const CAMPAIGN_TYPES = [
  "Newsletter",
  "Blog Post",
  "Exhibition",
  "Artist Profile",
  "Podcast Episode",
  "Event",
  "Public Art",
  "Video/Film",
  "Institutional",
  "Custom",
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

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
  url: string;
  type: CampaignType;
  brandIds: string[];
  durationDays: number;
  distributionBias: DistributionBias;
  editorialDirection: string;
  status: CampaignStatus;
  createdAt: string;
  createdBy: string;
}

export const POST_STATUSES = [
  "Pending",
  "Approved",
  "Modified",
  "Dismissed",
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
  scheduledDate: string;
  status: PostStatus;
  contentVariant: string;
  approvedBy: string;
  approvedAt: string;
  zernioPostId: string;
  notes: string;
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

// Duration presets for campaign creation
export const DURATION_PRESETS = [
  { label: "Sprint", days: 14, description: "2 weeks", defaultBias: "Front-loaded" as DistributionBias },
  { label: "Standard", days: 90, description: "3 months", defaultBias: "Front-loaded" as DistributionBias },
  { label: "Evergreen", days: 180, description: "6 months", defaultBias: "Front-loaded" as DistributionBias },
  { label: "Marathon", days: 365, description: "12 months", defaultBias: "Balanced" as DistributionBias },
] as const;
