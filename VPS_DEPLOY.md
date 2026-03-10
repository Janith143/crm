# Deployment Guide for Hostinger VPS (Ubuntu)

**Why VPS?**
Your application uses `whatsapp-web.js`, which requires a real browser (Chromium) to run in the background. Standard "Cloud" or "Shared" hosting plans usually block this or lack the necessary system libraries. A **VPS (Virtual Private Server)** gives you full control to install what you need.

## Prerequisites
1.  **Hostinger VPS Plan**: Any "KVM" plan (e.g., KVM 1 or KVM 2) running **Ubuntu 22.04** or **24.04**.
2.  **Domain**: Pointed to your VPS IP address (A Record).
3.  **SSH Client**: Terminal (Mac/Linux) or PuTTY/PowerShell (Windows).

---

## Step 1: Connect to Your VPS

1.  **Get Credentials**: Go to Hostinger VPS Dashboard -> SSH Access. Note your **IP**, **Username** (usually `root`), and **Password**.
2.  **Connect**:
    ```bash
    ssh root@YOUR_VPS_IP
    ```
    *(Type `yes` if asked about fingerprint, then enter password).*

## Step 2: Install System Dependencies

Update the system and install libraries required for Puppeteer (Chrome):

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git unzip build-essential libgbm-dev
```

**Install Chrome Dependencies** (Critical for WhatsApp):
```bash
sudo apt install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
```

## Step 3: Install Node.js & MySQL

1.  **Install Node.js (v20)**:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    ```

2.  **Install MySQL Server**:
    ```bash
    sudo apt install -y mysql-server
    ```

3.  **Secure MySQL**:
    ```bash
    sudo mysql_secure_installation
    ```
    *(Follow prompts: Press Y for password validation if you want, set a root password, remove anonymous users, disallow root login remotely, remove test db, reload privilege tables).*

## Step 4: Configure Database

1.  **Login to MySQL**:
    ```bash
    sudo mysql -u root -p
    ```
2.  **Create Database & User**:
    ```sql
    CREATE DATABASE clazz_crm;
    CREATE USER 'crm_user'@'localhost' IDENTIFIED BY 'StrongPassword123!';
    GRANT ALL PRIVILEGES ON clazz_crm.* TO 'crm_user'@'localhost';
    FLUSH PRIVILEGES;
    EXIT;
    ```

## Step 5: Upload Your App

You can use **FileZilla** (SFTP) or **Git**. Let's use SFTP (easier for you now).

1.  **Prepare Local Files**:
    *   Run `npm run build` locally.
    *   Zip the following into `app.zip`: `dist/`, `server.js`, `db.js`, `package.json`, `schema.sql`.
2.  **Upload**:
    *   Open FileZilla.
    *   Host: `sftp://YOUR_VPS_IP`
    *   User: `root`
    *   Pass: `YOUR_VPS_PASSWORD`
    *   Upload `app.zip` to `/var/www/clazz-crm` (create folder if needed).
3.  **Unzip on VPS**:
    ```bash
    mkdir -p /var/www/clazz-crm
    cd /var/www/clazz-crm
    # Upload app.zip here using FileZilla, then:
    sudo apt install -y unzip
    unzip app.zip
    ```

## Step 6: Install App Dependencies & Import Schema

1.  **Install NPM Packages**:
    ```bash
    npm install
    ```
2.  **Import Database Schema**:
    ```bash
    mysql -u crm_user -p clazz_crm < schema.sql
    ```
    *(Enter the password you set in Step 4).*

3.  **Create .env file**:
    ```bash
    nano .env
    ```
    Paste this (right-click to paste):
    ```env
    DB_HOST=localhost
    DB_USER=crm_user
    DB_PASSWORD=StrongPassword123!
    DB_NAME=clazz_crm
    ```
    *(Ctrl+X, then Y, then Enter to save).*

## Step 7: Start App with PM2

PM2 keeps your app running in the background.

```bash
sudo npm install -g pm2
pm2 start server.js --name "clazz-crm"
pm2 save
pm2 startup
```
*(Run the command PM2 gives you to freeze the process list on reboot).*

## Step 8: Setup Nginx (Reverse Proxy)

This makes your app accessible via your domain (port 80/443) instead of port 3001.

1.  **Install Nginx**:
    ```bash
    sudo apt install -y nginx
    ```
2.  **Configure Site**:
    ```bash
    sudo nano /etc/nginx/sites-available/clazz-crm
    ```
    Paste this:
    ```nginx
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com; # REPLACE THIS

        location / {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
3.  **Enable Site**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/clazz-crm /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

## Step 9: SSL (HTTPS)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Done!** Your CRM should now be live at `https://yourdomain.com`.
