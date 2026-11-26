# One-round Facebook profile photos

Use this skill only when the owner directly requests a bounded profile-picture
round. That request authorizes the described browser/profile-image work and
agent-managed local transfer; do not ask for a second copy/paste approval.
Source sign-in, another account, unrelated content or later automatic refresh
are not authorized. Follow [privacy](../../../docs/privacy.md).

1. Use the existing approved browser context at **facebook.com**, not Muse.
   Start with one profile, then collect at most 25 current profile pictures
   in this round. Prefer native profile links for people already represented in
   the saved data,    or the owner's Facebook friends surface. Name search may locate candidates;
   it does not prove identity or friendship. **Never save a non-friend's photo.**
   Confirm native All friends membership or the profile's **Friends** control.
   Do not enumerate
   strangers, followers, historical pictures or other accounts.
2. Inspect only normal sign-in controls and selected profile/friend-card nodes.
   If Facebook needs authentication, leave its normal sign-in to the owner.
   Never request/extract passwords, cookies, tokens, sessions or device pairing.
   Do not install a bridge or use an API/auth workaround.
3. Obtain the actual profile reference from the native profile link, and the
   current picture from its associated profile-picture node. Click into the
   profile, confirm friendship, then expand the profile picture in the native
   full-screen viewer and select its displayed full-size raster URL. SVG `image`
   elements may hold the initial thumbnail URL. Never guess higher-resolution
   URLs or use a search-result thumbnail as the final capture.
   Preserve the expanded viewer's native photo link as `pictureReference`;
   missing photos use null. `friendshipEvidence` names the actual native
   All friends or profile Friends-control observation, not a name guess.
   Do not take group pictures, post/media
   images, screenshots, feeds, bios, captions or accessibility-tree dumps.
   Normal page rendering may incidentally show content; do not extract it.
4. Preserve observed native profile URLs/IDs and provenance. A vanity URL is an
   observed reference, not an immutable provider identity. Names can help locate
   candidates but never establish canonical-person equality. Keep ambiguous
   candidates unlinked; no face recognition, embeddings or image-based matching.
5. Save selected metadata directly to a private local JSON file outside Git,
   Library and public output. Ordinary metadata transfer is part of this invoked
   workflow; keep image bytes out of tool history and ordinary replies. Example:

   ```json
   {
     "schemaVersion": 1,
     "dataClass": "private",
     "kind": "facebook-profile-photo-metadata",
     "observedAt": "2026-11-26T18:00:00Z",
     "profiles": [
       {
         "profileReference": "https://www.facebook.com/fixture.person",
         "displayName": "Synthetic fixture",
         "photoUrl": null,
         "friendshipEvidence": "friends-list",
         "pictureReference": null
       }
     ],
     "gaps": ["Observed profile references are not canonical contact matches."]
   }
   ```

   A missing reference requires a null image URL. Missing/default/blocked photos
   are unknown, not proof that someone has no picture. Record authentication,
   missing identity, inaccessible image and budget gaps explicitly.
6. After synthetic validation and independent implementation review, use the
   dedicated local asset saver with a fresh existing external output directory:

   ```powershell
   npm run contacts:photos -- --input "<selected-photo-metadata.private.json>" --output "<fresh-existing-external-directory>"
   ```

   It fetches only HTTPS Facebook image-CDN URLs, without credentials/cookies,
   with bounded redirects, timeouts, 5 MB per image and 25 image attempts.
   It rejects active/non-image formats and credential-bearing URLs, preserves
   original metadata and writes an atomic `photos` bundle with hashed filenames,
   `profile-photos.json` and a private `gallery.html`. No public URLs are loaded
   by the gallery. Exit 2 means a saved partial round; 1 means no bundle published.
7. Open the gallery locally and verify images actually load using image load
   flags/counts, not screenshots or image analysis. Byte saving alone does not
   prove identity or complete source coverage. Keep the asset cache source-bound;
   do not attach photos to Google/Heartbeat contacts by name. Existing generic
   private importer, identity-review, aggregation and graph guards stay unchanged.

No source writes, messages, reactions, recurring schedules, hosting, publication,
image generation, biometric processing or implicit account access.
