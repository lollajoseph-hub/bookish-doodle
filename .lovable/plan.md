# First-name-only AI analysis

## What will change
- Add a shared display sanitizer that replaces every case-insensitive occurrence of a candidate’s stored full name in generated analysis text with only their first name.
- Apply it to both `approved_summary` and every `highlights` item in the profile dialog, so existing database content is corrected immediately.
- Apply the same protection to the summary excerpt on candidate cards, preventing the same stored text from revealing a surname elsewhere.

## Source investigation
- This client project only reads `approved_summary` and `highlights` from `candidate_pool_profile`; it contains no AI generation prompt or function to update.
- The generation source lives outside this repository. I will not invent or modify an unknown backend function. The display protection will cover both existing and newly generated text in this app; the external generation prompt should separately be instructed to use first names only when its source is available.

## Verification
- Render a candidate profile with a stored summary and highlight containing a full name.
- Confirm the AI Analysis section shows only the first name, while unrelated text remains unchanged.
- Run the focused type check and inspect the rendered dialog for errors.
