#!/usr/bin/env node
/**
 * Seed Airtable base with Platform Settings and Image Sizes records.
 * Run: node scripts/seed-airtable.js
 */

const BASE_ID = "app5FPCG06huzh7hX";
const PAT = "patO7RElDWYl9bwLo.e5c0dfeb7767ac6e862c588bb02d3a948cae51c8aa35b7de0c6a2a1cd359f3c1";

const PLATFORM_SETTINGS_TABLE = "Platform Settings";
const IMAGE_SIZES_TABLE = "Image Sizes";

async function createRecords(tableName, records) {
  // Airtable API accepts max 10 records per request
  const batches = [];
  for (let i = 0; i < records.length; i += 10) {
    batches.push(records.slice(i, i + 10));
  }

  let created = 0;
  for (const batch of batches) {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: batch.map((fields) => ({ fields })) }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error(`Error in ${tableName}:`, data.error);
      return;
    }
    created += data.records.length;
  }
  console.log(`${tableName}: ${created} records created`);
}

const platformSettingsRecords = [
  {
    Platform_Post_Type: "Threads - Posts",
    Ideal_Length: "200-300 chars",
    URL_Handling: "URLs count as full length. Can use text attachment feature.",
    URL_Recommendation: "Include URLs directly. Text attachment (10k chars) for long content.",
    Content_Type: ["Text", "Image", "Video", "Link", "GIF", "Carousel"],
    Tone: ["Conversational", "Authentic", "Humorous", "Casual"],
    Primary_Use_Case: "Conversations; community; replies (50% of engagement); less formal than Twitter/X.",
    Engagement_Notes: "Replies matter. Can post 20 media items. Text attachments rolling out.",
    Hashtag_Limit: "No official limit",
    Video_Length: "Up to 5 minutes",
  },
  {
    Platform_Post_Type: "Instagram - Feed Posts",
    Max_Characters: 2200,
    Ideal_Length: "125-300 chars (truncates at 125 on mobile)",
    URL_Handling: "URLs in captions are NOT clickable. Must use link in bio.",
    URL_Recommendation: "DO NOT include URLs in captions. Reference 'link in bio' instead. Instagram penalizes non-clickable links.",
    Content_Type: ["Image", "Video", "Carousel"],
    Tone: ["Authentic", "Visual-first", "Casual", "Aspirational"],
    Primary_Use_Case: "Evergreen content; brand awareness; polished visuals; storytelling.",
    Engagement_Notes: "First 125 chars critical. Use 3-5 relevant hashtags. Captions support brand voice.",
    Hashtag_Limit: "30 (recommended 3-5)",
    Video_Length: "Up to 90 seconds",
  },
  {
    Platform_Post_Type: "Facebook - Stories",
    Ideal_Length: "Minimal text overlay",
    URL_Handling: "Links can be added via stickers (if eligible)",
    URL_Recommendation: "Use link stickers when available. Drive to bio or posts instead.",
    Content_Type: ["Image", "Video", "Boomerang"],
    Tone: ["Casual", "Authentic", "Behind-the-scenes"],
    Primary_Use_Case: "Ephemeral content (24hr); real-time updates; interactive polls/questions; urgency.",
    Engagement_Notes: "Keep text minimal due to 24hr lifespan. Use interactive elements. 310px top/bottom safe zones for interface elements.",
    Hashtag_Limit: "No hashtag feature",
    Video_Length: "Up to 60 seconds",
  },
  {
    Platform_Post_Type: "TikTok - Videos",
    Max_Characters: 4000,
    Ideal_Length: "100-300 chars",
    URL_Handling: "URLs NOT clickable in captions. Link via @/bio features.",
    URL_Recommendation: "DO NOT use URLs in captions. Use bio or TikTok link features.",
    Content_Type: ["Short-form Video"],
    Tone: ["Authentic", "Entertaining", "Trend-driven", "Creative"],
    Primary_Use_Case: "Viral; discovery; brand building; trending content.",
    Engagement_Notes: "Hook in 3s. Use trending sound. Auto-captions. Tags for discoverability. 1-4x daily.",
    Hashtag_Limit: "No official limit (3-5 recommended)",
    Video_Length: "15s-10min (optimal: 21-34s)",
  },
  {
    Platform_Post_Type: "Mastodon - Posts (Toots)",
    Ideal_Length: "300-400 chars",
    URL_Handling: "URLs = 23 chars (like Twitter/X); can go longer by instance.",
    URL_Recommendation: "Include URLs directly; some instances let 5k chars.",
    Content_Type: ["Text", "Image", "Video", "Poll"],
    Tone: ["Conversational", "Community-focused", "Thoughtful"],
    Primary_Use_Case: "Decentralized, thoughtful communities; privacy-focused.",
    Engagement_Notes: "Instance limits vary (some 5k). Content warnings & alt text used; no algorithm.",
    Hashtag_Limit: "No official limit",
    Video_Length: "Varies by instance",
  },
  {
    Platform_Post_Type: "Pinterest - Pins",
    Max_Characters: 500,
    Ideal_Length: "100-300 chars (first 50 visible initially)",
    URL_Handling: "Destination URL is in 'link' field - NOT in description.",
    URL_Recommendation: "ALWAYS put URL in destination link field. Optimize for keywords.",
    Content_Type: ["Image", "Video", "Idea Pins", "Carousel"],
    Tone: ["Inspirational", "Helpful", "Search-optimized", "Aspirational"],
    Primary_Use_Case: "Evergreen; tutorials; visual inspiration; SEO-driven; traffic generation.",
    Engagement_Notes: "Front-load keywords. Use up to 5 hashtags. Long lifespan. Desc field separate from URL field.",
    Hashtag_Limit: "20 max (3-5 recommended)",
    Video_Length: "Idea Pins: 6-60 seconds",
  },
  {
    Platform_Post_Type: "Instagram - Reels",
    Max_Characters: 2200,
    Ideal_Length: "100-300 chars",
    URL_Handling: "URLs NOT clickable in captions",
    URL_Recommendation: "DO NOT include URLs. Use link in bio or link stickers for stories.",
    Content_Type: ["Short-form Video"],
    Tone: ["Entertaining", "Trendy", "Authentic", "Educational"],
    Primary_Use_Case: "Discovery; viral potential; entertaining/educational content.",
    Engagement_Notes: "First 125 chars visible. Use trending audio. Hook in 3s. Captions for accessibility.",
    Hashtag_Limit: "30 (recommended 3-5)",
    Video_Length: "15-90 seconds (optimal 21-34s)",
  },
  {
    Platform_Post_Type: "X/Twitter - Posts",
    Max_Characters: 280,
    Ideal_Length: "70-100 chars",
    URL_Handling: "URLs count as 23 characters regardless of length.",
    URL_Recommendation: "Include URLs directly. Auto-shortened to 23 chars.",
    Content_Type: ["Text", "Image", "Video", "GIF", "Poll"],
    Tone: ["Punchy", "Real-time", "Conversational", "Hot-takes"],
    Primary_Use_Case: "Breaking news; quick updates; text-first engagement.",
    Engagement_Notes: "Text performs best. First 100 chars are key. Can attach 4 media items.",
    Hashtag_Limit: "No limit",
    Video_Length: "Up to 2min 20sec (free)/longer Premium",
  },
  {
    Platform_Post_Type: "Facebook - Page Posts",
    Max_Characters: 63206,
    Ideal_Length: "40-80 chars",
    URL_Handling: "URLs don't reduce character count. Use Open Graph tags (og:image) for link previews.",
    URL_Recommendation: "Include URLs in post. Link previews pull from og:tags. Meta title <60 chars, meta description <155 chars.",
    Content_Type: ["Image", "Video", "Link", "Text", "Live Video"],
    Tone: ["Conversational", "Meaningful", "Community-focused"],
    Primary_Use_Case: "Community building; longer stories; meaningful interactions. Link previews display well with proper metadata.",
    Engagement_Notes: "Keep posts short despite high limit. First 2 lines most visible. Focus on context for links. Visual content performs best.",
    Hashtag_Limit: "No official limit",
    Video_Length: "N/A",
  },
  {
    Platform_Post_Type: "LinkedIn - Posts",
    Max_Characters: 3000,
    Ideal_Length: "1300-1600 chars (truncates at ~210)",
    URL_Handling: "URLs don't reduce character count. Link previews auto-generate.",
    URL_Recommendation: "Include URLs. Generate rich previews. Keep URL in post or first comment.",
    Content_Type: ["Image", "Video", "Document", "Article", "Poll", "Carousel"],
    Tone: ["Professional", "Thought-leadership", "Insightful", "Authentic"],
    Primary_Use_Case: "Industry insights; B2B; expertise building; networking.",
    Engagement_Notes: "First 140 chars critical. Use line breaks. Ask questions. Tag people/companies.",
    Hashtag_Limit: "No hashtag limit (3-5 recommended)",
    Video_Length: "Up to 10 minutes",
  },
  {
    Platform_Post_Type: "Bluesky - Posts",
    Max_Characters: 275,
    Ideal_Length: "150-250 chars",
    URL_Handling: "URLs can be faceted (truncated in display; full URL preserved).",
    URL_Recommendation: "Faceted URLs save space. Truncated as 'domain.com...'.",
    Content_Type: ["Text", "Image", "Video", "Link"],
    Tone: ["Thoughtful", "Authentic", "Conversational", "Less-polished-than-X"],
    Primary_Use_Case: "Deeper conversations; tech/creative communities; decentralized.",
    Engagement_Notes: "Auto-facets URLs. Post full URL but truncated in display. Faceting = more text.",
    Hashtag_Limit: "No official limit",
    Video_Length: "Up to 60 seconds",
  },
  {
    Platform_Post_Type: "Instagram - Stories",
    Max_Characters: 120,
    Ideal_Length: "Minimal text overlay on visual",
    URL_Handling: "Link stickers available for all accounts now",
    URL_Recommendation: "Use link stickers. Can add multiple links per story. No URL in text needed.",
    Content_Type: ["Image", "Video", "Boomerang", "Text", "Poll", "Quiz"],
    Tone: ["Casual", "Authentic", "Behind-the-scenes", "Interactive"],
    Primary_Use_Case: "Real-time engagement; ephemeral content; interactive features; direct traffic.",
    Engagement_Notes: "2-7 stories/day; leave 310px padding for UI; use interactive stickers.",
    Hashtag_Limit: "No hashtag limit but hidden",
    Video_Length: "Up to 60 seconds per story",
  },
  {
    Platform_Post_Type: "YouTube Shorts - Videos",
    Max_Characters: 5000,
    Ideal_Length: "Title <70 chars; Desc 100-300 chars",
    URL_Handling: "URLs allowed in description. Title ~40 chars visible (mobile).",
    URL_Recommendation: "Put URLs in description. First 125 chars visible before 'show more'.",
    Content_Type: ["Short-form Video"],
    Tone: ["Educational", "Entertaining", "Quick-hitting", "Snackable"],
    Primary_Use_Case: "Discoverability; channel growth; repurposed content; shorts feed.",
    Engagement_Notes: "Title: 40 chars visible (mobile). Use #Shorts. 3-5 tags. Thumbnail customization.",
    Hashtag_Limit: "No limit (3-5 recommended)",
    Video_Length: "Under 60 seconds",
  },
];

const imageSizeRecords = [
  { Label: "TikTok Post (Feed)", Platform: "TikTok", "Image Type": "Post (Feed)", "Preferred Width (px)": 1080, "Preferred Height (px)": 1920, "Aspect Ratio": "9:16", "File Type": "JPG", "Cropping Notes": "Vertical format; black bars added if different dimensions used", "Additional Guidelines": "Ideal for vertical videos; platform adds black bars for other orientations", "Use Case Tags": ["Feed", "Post"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Video", "Photo"], "AI Notes Summary": "Use vertical JPG images in 9:16 ratio to avoid black bars.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "YouTube Profile", Platform: "YouTube", "Image Type": "Profile", "Preferred Width (px)": 800, "Preferred Height (px)": 800, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Center focus of photo; renders at 98x98px", "Max File Size (MB)": 15, "Additional Guidelines": "Square format; keep important elements centered for small display size", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image under 15MB with centered content.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "LinkedIn Post (Feed)", Platform: "LinkedIn", "Image Type": "Post (Feed)", "Preferred Width (px)": 1200, "Preferred Height (px)": 627, "Aspect Ratio": "1.91:1", "File Type": "JPG", "Cropping Notes": "Landscape format for link previews and posts", "Additional Guidelines": "Minimum 200px width; also supports 1200x1200 square and 720x900 vertical", "Use Case Tags": ["Feed", "Post"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "Link"], "AI Notes Summary": "Use JPG images with minimum 200px width in landscape, square, or vertical formats.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Pinterest Profile", Platform: "Pinterest", "Image Type": "Profile", "Preferred Width (px)": 280, "Preferred Height (px)": 280, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; center important content", "Additional Guidelines": "Square upload but displays as circular profile photo", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image with centered content as it displays as a circle.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Instagram Reel", Platform: "Instagram", "Image Type": "Reel", "Preferred Width (px)": 1080, "Preferred Height (px)": 1920, "Aspect Ratio": "9:16", "File Type": "JPG", "Cropping Notes": "Vertical format; displays as 1080x1440 on grid view", "Additional Guidelines": "Feed shows 9:16 ratio, grid view crops to 3:4 ratio", "Use Case Tags": ["Reel", "Mobile Display"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Video", "Reel"], "AI Notes Summary": "Use vertical JPG images that display differently in feed (9:16) versus grid view (3:4).", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Threads Profile", Platform: "Threads", "Image Type": "Profile", "Preferred Width (px)": 640, "Preferred Height (px)": 640, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; square upload format", "Additional Guidelines": "Similar to other Meta platforms; crops to circular display", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image that displays as a circle.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "TikTok Profile", Platform: "TikTok", "Image Type": "Profile", "Preferred Width (px)": 200, "Preferred Height (px)": 200, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; uploads square but shows at 100px in feeds", "Additional Guidelines": "Minimum 20x20px but recommend higher quality for future-proofing", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a high-quality square JPG image as it displays as a circle at 100px.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Instagram Profile", Platform: "Instagram", "Image Type": "Profile", "Preferred Width (px)": 320, "Preferred Height (px)": 320, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; center important elements", "Additional Guidelines": "Displays at 110x100px but stored at 320x320px", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image with centered content.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "X/Twitter Post (Feed)", Platform: "X/Twitter", "Image Type": "Post (Feed)", "Preferred Width (px)": 1280, "Preferred Height (px)": 720, "Aspect Ratio": "16:9", "File Type": "JPG", "Cropping Notes": "Landscape format; can post up to 4 images per tweet", "Max File Size (MB)": 5, "Additional Guidelines": "Also supports 720x1280 vertical, 720x720 square; up to 15MB on web", "Use Case Tags": ["Feed", "Post", "Multi-Image"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "GIF"], "AI Notes Summary": "Use JPG images under 5MB in landscape, square, or vertical formats.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "X/Twitter Cover/Banner", Platform: "X/Twitter", "Image Type": "Cover/Banner", "Preferred Width (px)": 1500, "Preferred Height (px)": 500, "Aspect Ratio": "3:1", "File Type": "JPG", "Cropping Notes": "60px may be cropped from top/bottom depending on display", "Additional Guidelines": "Header display varies by monitor and browser; center important content", "Use Case Tags": ["Banner", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use a JPG image with important content centered.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "LinkedIn Company Logo", Platform: "LinkedIn", "Image Type": "Company Logo", "Preferred Width (px)": 400, "Preferred Height (px)": 400, "Aspect Ratio": "1:1", "File Type": "PNG", "Cropping Notes": "Square format; high contrast recommended", "Additional Guidelines": "Company page logo; use PNG for logos with transparent backgrounds", "Use Case Tags": ["Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use a square PNG logo with high contrast.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Facebook Profile", Platform: "Facebook", "Image Type": "Profile", "Preferred Width (px)": 196, "Preferred Height (px)": 196, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; keep important content centered", "Additional Guidelines": "Profile photo overlaps cover on pages; displays at 176x176 on desktop, 196x196 on mobile", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image with centered content.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Bluesky Profile", Platform: "Bluesky", "Image Type": "Profile", "Preferred Width (px)": 1000, "Preferred Height (px)": 1000, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; center important content", "Max File Size (MB)": 1, "Additional Guidelines": "Square format; crops to circle display", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image under 1MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Snapchat Cover/Banner", Platform: "Snapchat", "Image Type": "Cover/Banner", "Preferred Width (px)": 375, "Preferred Height (px)": 278, "Aspect Ratio": "1.35:1", "File Type": "JPG", "Cropping Notes": "May crop to 375x278 from larger uploads", "Max File Size (MB)": 2, "Additional Guidelines": "Banner image cropping varies; optimal size prevents unwanted cropping", "Use Case Tags": ["Banner", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use JPG banner images under 2MB at optimal dimensions.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Facebook Story", Platform: "Facebook", "Image Type": "Story", "Preferred Width (px)": 1080, "Preferred Height (px)": 1920, "Aspect Ratio": "9:16", "File Type": "JPG", "Cropping Notes": "Full-screen vertical format; leave safe areas for UI elements", "Max File Size (MB)": 30, "Additional Guidelines": "Stories take up full phone screen; keep important content in safe area", "Use Case Tags": ["Story", "Mobile Display"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "Video", "Story"], "AI Notes Summary": "Create vertical JPG images under 30MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Bluesky Post (Feed)", Platform: "Bluesky", "Image Type": "Post (Feed)", "Preferred Width (px)": 1000, "Preferred Height (px)": 1000, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Platform stores longest side at 1000px", "Max File Size (MB)": 1, "Additional Guidelines": "Supports up to 4 images per post; standard ratios like 1:1, 9:16, 3:4, 4:5", "Use Case Tags": ["Feed", "Post", "Multi-Image"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use standard aspect ratio JPG images under 1MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Facebook Cover/Banner", Platform: "Facebook", "Image Type": "Cover/Banner", "Preferred Width (px)": 851, "Preferred Height (px)": 315, "Aspect Ratio": "2.7:1", "File Type": "JPG", "Cropping Notes": "Keep important content centered; displays differently on desktop vs mobile", "Additional Guidelines": "Desktop displays at 820x312px, mobile at 640x360px; minimum 400x150px", "Use Case Tags": ["Banner", "Branding", "Mobile Display"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use a JPG image with centered important content.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "YouTube Cover/Banner", Platform: "YouTube", "Image Type": "Cover/Banner", "Preferred Width (px)": 2560, "Preferred Height (px)": 1440, "Aspect Ratio": "16:9", "File Type": "JPG", "Cropping Notes": "Safe area for text/logos is 1235x338px at minimum dimensions", "Max File Size (MB)": 6, "Additional Guidelines": "Minimum 2048x1152px; displays differently across devices", "Use Case Tags": ["Banner", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use a JPG banner under 6MB with important content within the safe area.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Snapchat Profile", Platform: "Snapchat", "Image Type": "Profile", "Preferred Width (px)": 320, "Preferred Height (px)": 320, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Square format; minimum size required", "Max File Size (MB)": 2, "Additional Guidelines": "Minimum dimensions for profile photo upload", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG profile image under 2MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Bluesky Cover/Banner", Platform: "Bluesky", "Image Type": "Cover/Banner", "Preferred Width (px)": 3000, "Preferred Height (px)": 1000, "Aspect Ratio": "3:1", "File Type": "JPG", "Cropping Notes": "Renders differently on desktop vs mobile; center important info", "Additional Guidelines": "Keep important information centered", "Use Case Tags": ["Banner", "Branding", "Mobile Display"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use a JPG banner with important content centered.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "X/Twitter Profile", Platform: "X/Twitter", "Image Type": "Profile", "Preferred Width (px)": 400, "Preferred Height (px)": 400, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Displays as circle; center important content", "Max File Size (MB)": 2, "Additional Guidelines": "Square format recommended for profile photos", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG image under 2MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Instagram Post (Feed)", Platform: "Instagram", "Image Type": "Post (Feed)", "Preferred Width (px)": 1080, "Preferred Height (px)": 1350, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Square format preferred; all orientations crop to vertical on grid", "Additional Guidelines": "Supports 1080x566 landscape, 1080x1350 portrait; width of 1080px recommended", "Use Case Tags": ["Feed", "Post"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use 1080px width JPG images.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "LinkedIn Profile", Platform: "LinkedIn", "Image Type": "Profile", "Preferred Width (px)": 400, "Preferred Height (px)": 400, "Aspect Ratio": "1:1", "File Type": "JPG", "Cropping Notes": "Square format; professional headshot recommended", "Max File Size (MB)": 8, "Additional Guidelines": "Maximum 7680x4320px supported; minimum 400x400px recommended", "Use Case Tags": ["Profile", "Branding"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Upload a square JPG professional headshot under 8MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "LinkedIn Cover/Banner", Platform: "LinkedIn", "Image Type": "Cover/Banner", "Preferred Width (px)": 1584, "Preferred Height (px)": 396, "Aspect Ratio": "4:1", "File Type": "JPG", "Cropping Notes": "Displays differently on mobile vs desktop; center important content", "Max File Size (MB)": 8, "Additional Guidelines": "Personal profile cover photo; check on both mobile and desktop", "Use Case Tags": ["Banner", "Branding", "Mobile Display"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use a JPG image under 8MB with centered content.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Facebook Post (Feed)", Platform: "Facebook", "Image Type": "Post (Feed)", "Preferred Width (px)": 1080, "Preferred Height (px)": 566, "Aspect Ratio": "1.91:1", "File Type": "JPG", "Cropping Notes": "Landscape format; optimized for feed display", "Additional Guidelines": "Also supports 1080x1359 (4:5) vertical and 1080x1080 (1:1) square formats", "Use Case Tags": ["Feed", "Post"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "Link"], "AI Notes Summary": "Use 1080px width JPG images in landscape, square, or vertical formats.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Instagram Story", Platform: "Instagram", "Image Type": "Story", "Preferred Width (px)": 1080, "Preferred Height (px)": 1920, "Aspect Ratio": "9:16", "File Type": "JPG", "Cropping Notes": "Keep content in safe area (1080x1610px)", "Additional Guidelines": "Full-screen vertical format; 310px padding top/bottom recommended", "Use Case Tags": ["Story", "Mobile Display"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "Video", "Story"], "AI Notes Summary": "Create vertical JPG images with important content within the safe area.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "YouTube Thumbnail", Platform: "YouTube", "Image Type": "Thumbnail", "Preferred Width (px)": 1280, "Preferred Height (px)": 720, "Aspect Ratio": "16:9", "File Type": "JPG", "Cropping Notes": "Minimum 640px width; landscape orientation", "Max File Size (MB)": 2, "Additional Guidelines": "Custom thumbnails available for verified accounts", "Use Case Tags": ["Thumbnail"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "Video"], "AI Notes Summary": "Create landscape JPG thumbnails under 2MB.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Threads Post (Feed)", Platform: "Threads", "Image Type": "Post (Feed)", "Preferred Width (px)": 1440, "Preferred Height (px)": 1920, "Aspect Ratio": "3:4", "File Type": "JPG", "Cropping Notes": "Native 3:4 ratio; supports wide range of aspect ratios", "Max File Size (MB)": 8, "Additional Guidelines": "Supports 0.01:1 to 10:1 ratios; carousel posts up to 20 images; minimum 320px width", "Use Case Tags": ["Feed", "Post", "Carousel"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo"], "AI Notes Summary": "Use JPG images under 8MB in 3:4 native ratio.", "Last Updated": "2025-10-22T00:00:00.000Z" },
  { Label: "Pinterest Pin", Platform: "Pinterest", "Image Type": "Pin", "Preferred Width (px)": 1000, "Preferred Height (px)": 1500, "Aspect Ratio": "2:3", "File Type": "JPG", "Cropping Notes": "Vertical format preferred; stay within safe zones", "Max File Size (MB)": 20, "Additional Guidelines": "Safe zones: top 270px, left 65px, right 195px, bottom 790px; supports ratios 9:16, 3:4, 4:5, 1:1", "Use Case Tags": ["Pin"], "Source Link": "https://blog.hootsuite.com/social-media-image-sizes-guide/", "Related Post/Video Types": ["Photo", "Pin"], "AI Notes Summary": "Use vertical JPG images under 20MB within safe zones.", "Last Updated": "2025-10-22T00:00:00.000Z" },
];

async function main() {
  console.log("Seeding Platform Settings...");
  await createRecords(PLATFORM_SETTINGS_TABLE, platformSettingsRecords);

  console.log("Seeding Image Sizes...");
  await createRecords(IMAGE_SIZES_TABLE, imageSizeRecords);

  console.log("Done!");
}

main().catch(console.error);
