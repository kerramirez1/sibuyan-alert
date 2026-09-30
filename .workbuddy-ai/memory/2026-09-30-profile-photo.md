# 2026-09-30 (cont.) — Profile photo removal

## Reported: "successful naman pero hindi parin ma-delete ang photo"

The success message was **true** — the profile really was saved. The photo was the part that
never happened, and it was missing in **three places at once**:

| Layer | What it did | What was missing |
|---|---|---|
| `ProfileSettingsPage.handleRemovePhoto()` | Cleared the local preview, toast: "Photo removed. Save changes to update profile." | Any signal to the server |
| `ProfileSettingsPage.handleSubmit()` | `if (formData.avatar) data.append('avatar', …)` | Nothing appended when removing — the server could not tell "remove" from "no change" |
| `authController.updateProfile()` | `if (req.file) { … user.avatar = … }` | **No branch that clears `user.avatar`** — removal was impossible server-side |

So the request was a valid profile update carrying no avatar information, the API answered
`success: true`, and the UI said "Profile updated successfully" with the avatar untouched.

**Aggravating detail:** when the photo was the *only* change, the `FormData` was completely
empty — a multipart request with no fields at all.

**Second defect found alongside it:** the old-file cleanup was gated on
`uploadedAvatarUrl && previousAvatar`, i.e. replacement only. Clearing the field without
deleting the object would have orphaned the GridFS file while the profile read as photo-less.

## Fix

- **Server** — reads `removeAvatar` from the body (multipart delivers strings, so it is
  compared textually) and clears `user.avatar` when set and no replacement file is present.
  The cleanup condition is now `previousAvatar && (uploadedAvatarUrl || avatarRemovalRequested)`
  so a removal discards the stored object too.
- **Client `handleSubmit`** — `else if (avatarRemoved) data.append('removeAvatar', 'true')`.

**Deliberately unchanged:** an ordinary profile edit still cannot wipe an avatar by omitting
it — omitting means "leave it alone". Asserted both ways.

## Tests

- `server/tests/profileAvatarRemoval.test.js` (6, new) — clears the field **and** deletes the
  file; an ordinary edit does not wipe it; `removeAvatar=false` is not a removal; a
  replacement still wins; removal with no stored avatar is a no-op; a removal-only request is
  still a successful save.
- `client/src/test/ProfileSettingsPageAvatar.test.jsx` (+2) — the payload carries
  `removeAvatar=true` and no `avatar` file; an ordinary edit carries neither.
