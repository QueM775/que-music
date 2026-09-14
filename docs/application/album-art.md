🔄 How Album Art Works (Priority Order):

1. 🎵 Embedded Art (Automatic - Highest Priority)

What: Art embedded directly in MP3/FLAC files
User Action: None needed - automatic
Example: MP3 files with album art already embedded

2. 📁 Local Cover Files (Manual - Medium Priority)

What: Images in your E:\Erich\Music\assets\covers\ folder
Naming Convention: artist-album.jpg or album.jpg
User Action: Add properly named image files

3. 🖼️ Sample Cover (Fallback - Lowest Priority)

What: Default placeholder when nothing else is found
User Action: None needed

📝 For Manual Cover Files:
Based on your backend code, the naming patterns that work are:
E:\Erich\Music\assets\covers\
├── adele-25.jpg ✅ artist-album
├── adele-hello.jpg ✅ artist-album  
├── 25.jpg ✅ album name only
├── hello.jpg ✅ album name only
└── adele.jpg ✅ artist name only
🎯 Best Practice Recommendations:
Option 1: Let Embedded Art Handle It (Recommended)

Most modern music files already have embedded album art
Your system extracts this automatically
No manual work needed

Option 2: Add Manual Covers for Missing Art
If a song shows a placeholder, you can add covers using these naming patterns:

artist-album.jpg (most specific)
album.jpg (if multiple artists have same album)
artist.jpg (fallback for any album by that artist)

💡 Pro Tips:

Check first: Most songs probably already have embedded art working now
Only add manual covers for songs that show placeholders
Use consistent naming: lowercase, replace spaces with hyphens
Common formats: JPG, PNG, WebP all work
