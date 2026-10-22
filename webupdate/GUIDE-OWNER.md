# Web updates — guide for the owner (super admin)

## What you manage

- **People:** add, change or remove editors and the moderator from the Website panel ▸ **Users**. You create their Google accounts yourself, e.g. `adc.editor1@gmail.com`.
- **Activity:** the Website panel ▸ **Activity**, or the **Log** tab: who previewed, submitted, approved, sent back or published, and when.
- **Undo:** the Website panel ▸ **Undo the last publish** puts the previous version back.

## One-time setup (about 15 minutes, in this order)

### 1. The Google Sheet
1. Create an empty Google Sheet named **ADC Website**, in your own Google account.
2. **Extensions ▸ Apps Script.** Replace the code with the four files from `webupdate/apps-script/`: `Code.gs`, `Setup.gs`, `Layout.gs`, `Sidebar.html`. In **Project settings**, tick "Show appsscript.json", then paste that file too. Save.
3. **Project settings ▸ Script properties**, add:
   - `GITHUB_REPO` = `jagli/adc-webupdate` (later: `abhinava-code/website`)
   - `GITHUB_TOKEN` = the key from step 2 below
4. Reload the Sheet. A **Website** menu appears. **Website ▸ Owner ▸ Set up the Sheet.** Google asks you to allow access once; allow it. Every tab is laid out from the live website.
5. **Website ▸ Owner ▸ Check settings** should say "GitHub answers: yes".

### 2. The GitHub key (for the Sheet)
1. GitHub ▸ your profile ▸ **Settings ▸ Developer settings ▸ Fine-grained tokens ▸ Generate new token**.
2. **Repository access:** only `adc-webupdate`.
3. **Permissions:** **Contents: Read and write** and **Actions: Read and write**.
4. Copy the key into `GITHUB_TOKEN` (step 1.3).

### 3. Netlify (only when you are ready for the Sheet to publish)
1. Netlify ▸ **User settings ▸ Applications ▸ Personal access tokens ▸ New access token**. Copy it.
2. Netlify ▸ the site **abhinava-dance-2026** ▸ **Site configuration ▸ Site ID**. Copy it.
3. GitHub ▸ `adc-webupdate` ▸ **Settings ▸ Secrets and variables ▸ Actions**, add `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`. For Instagram, also add `INSTAGRAM_FEED_MAIN`, the same Behold link as in Netlify today.
4. Netlify ▸ **Site configuration ▸ Build & deploy ▸ Stop builds.** From then on only the Sheet's robot writes to abhinava.dance.

Until step 3 is done, everything works except the last step: Approve shows "the owner still has to connect Netlify", and the live site stays as it is.

## When the developer changes a page's layout
The developer copies the new pages into the update project. Editors' content is kept by key, and anything new or dropped is listed. Then you run **Website ▸ Owner ▸ Set up the Sheet** once, so the tabs show the new layout.
