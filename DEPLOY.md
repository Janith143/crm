# Deployment Guide for Hostinger

This guide will help you deploy your Clazz CRM application to Hostinger Cloud Hosting (or Shared Hosting with Node.js support).

## Prerequisites

1.  **Hostinger Account**: You need a hosting plan that supports Node.js (most Hostinger plans do).
2.  **Domain**: A domain name connected to your hosting.
3.  **File Access**: Access to File Manager or FTP.

## Step 1: Database Setup

1.  **Log in to Hostinger hPanel**.
2.  Go to **Databases** -> **Management**.
3.  **Create a New MySQL Database**:
    *   **Database Name**: e.g., `u123456789_clazz_crm`
    *   **Database User**: e.g., `u123456789_admin`
    *   **Password**: Choose a strong password.
    *   **Note down these credentials**.
4.  **Enter phpMyAdmin**:
    *   Click "Enter phpMyAdmin" next to your new database.
5.  **Import Schema**:
    *   Click the **Import** tab.
    *   Choose the `schema.sql` file from your project folder.
    *   Click **Go**.
    *   This will create the `automation_rules` and `teacher_metadata` tables.

## Step 2: Prepare Application Files

1.  **Build the Frontend**:
    *   On your local machine, run:
        ```bash
        npm run build
        ```
    *   This creates a `dist` folder with your static site.

2.  **Zip Your Files**:
    *   Select the following files/folders and zip them into `app.zip`:
        *   `dist/` (The built frontend)
        *   `server.js`
        *   `db.js`
        *   `package.json`
        *   `package-lock.json`
        *   `public/` (if you have static assets served by Express, though Vite puts them in dist)
        *   `.wwebjs_auth/` (Optional: Include this if you want to keep your current WhatsApp session logged in. If excluded, you'll need to scan QR again).

## Step 3: Upload to Hostinger

1.  **Go to File Manager** in Hostinger.
2.  Navigate to `public_html` (or a subdomain folder if you prefer).
3.  **Upload** `app.zip`.
4.  **Extract** `app.zip`.
5.  **Move Files** (Important):
    *   Ensure `server.js`, `package.json`, etc., are in the root of your app folder.
    *   The `dist` folder should also be there.

## Step 4: Configure Node.js Application

1.  In Hostinger hPanel, go to **Advanced** -> **Node.js App** (or similar).
2.  **Create Application**:
    *   **Node.js Version**: Select 18 or higher (20 is recommended).
    *   **Application Mode**: Production.
    *   **Application Root**: The path to your uploaded files (e.g., `public_html`).
    *   **Application Startup File**: `server.js`.
    *   Click **Create**.

3.  **Install Dependencies**:
    *   Click **NPM Install** button in the Node.js App settings.
    *   Wait for it to complete.

4.  **Environment Variables**:
    *   Create a `.env` file in your `Application Root` (File Manager).
    *   Add your database credentials:
        ```env
        DB_HOST=localhost
        DB_USER=u123456789_admin
        DB_PASSWORD=your_password
        DB_NAME=u123456789_clazz_crm
        ```
    *   (Note: Hostinger DB Host is usually `localhost` or an IP provided in the Database section).

## Step 5: Update Server to Serve Frontend

Currently, `server.js` is an API server. We need it to serve the React frontend too.

**Edit `server.js` in Hostinger File Manager:**

Add this code near the top (after imports):
```javascript
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ... existing app setup ...

// Serve Static Files
app.use(express.static(path.join(__dirname, 'dist')));
```

And at the very bottom, before `app.listen`:
```javascript
// Handle React Routing
app.get('*', (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
```

*Alternatively, I have updated `server.js` in your local code to include this logic if you want to copy it now.*

## Step 6: Start the Server

1.  Go back to **Node.js App** settings.
2.  Click **Restart** (or Start).
3.  Visit your domain. You should see your CRM!

## Troubleshooting

*   **WhatsApp QR Code**: If you didn't upload `.wwebjs_auth`, check the server logs (in Node.js App settings -> Output Log) or visit your site. The QR code should appear on the dashboard/settings if implemented, or you might need to check logs to grab the QR code string if the UI doesn't show it yet.
*   **Database Errors**: Check `.env` credentials.
