# Class Timer with a built-in Mac widget — no Xcode needed

GitHub (free) has Mac computers that can compile the widget for you. You upload this folder once,
click a button, and download one finished app. Install it, open it, and **Class Timer** is already
in *Edit Widgets*, like Dropover.

It takes about 20 minutes the first time (most of that is waiting). You don't need to write any code.

## 1. Make a free GitHub account
Go to github.com and choose **Sign up**. (Skip this if you already have one.)

## 2. Make an empty repository
Click **+** (top right) → **New repository**. Name it anything, for example `class-timer`. Leave everything else as it is
(Private is fine) and click **Create repository**.

## 3. Upload the folder
On the new repository page click **uploading an existing file**.
Open this folder on your Mac, select **everything inside it** (`app`, `widget`, `README.md`, `PASTE-INTO-build.yml`)
and drag it all into the browser window. Wait for the upload bars to finish, then click **Commit changes**.
(If your browser won't take folders, use Chrome.)

## 4. Add the build instructions file
GitHub skips hidden folders when you upload, so add this one by hand:
- Click **Add file → Create new file**.
- In the name box type exactly `.github/workflows/build.yml` (typing the slashes makes the folders).
- Open `PASTE-INTO-build.yml` from this folder in TextEdit, select all, copy, and paste it into the big box.
- Click **Commit changes → Commit changes**.

The build starts by itself.

## 5. Wait for the build
Click the **Actions** tab, then click the running **Build Class Timer**. It takes about 8–12 minutes.
A green tick means it worked. If you see a red ✗, click it, copy the red error text, and send it to me.

## 6. Download your app
Go back to the repository's main page (click `class-timer` at the top). On the right, under **Releases**,
click **Class Timer build 1** and download **Class-Timer-Mac-AppleSilicon.zip**.

## 7. Install
- Unzip it and drag **Atlantis Class Timer** into **Applications** (replace the old one).
- Open it. If macOS blocks it: System Settings → Privacy & Security → **Open Anyway**.
- Leave it open for about 10 seconds, then right-click your desktop → **Edit Widgets** → search **Class Timer**.

Your timetable and settings carry over. The app keeps the widget up to date by itself.

## If the widget doesn't show up
1. Make sure the app is in **Applications**, quit it, and open it again.
2. Open Terminal and paste this, then try Edit Widgets again:
   `pluginkit -a "/Applications/Atlantis Class Timer.app/Contents/PlugIns/ClassTimerWidget.appex"`
3. If it still isn't there, send me what Terminal printed.
