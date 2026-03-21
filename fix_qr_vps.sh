#!/bin/bash

echo "🛑 Stopping Clazz CRM..."
pm2 stop clazz-crm

echo "🧹 Killing orphaned Chrome/Puppeteer processes..."
pkill -f chrome
pkill -f chromium
pkill -f puppeteer

echo "🗑️ Clearing WhatsApp Web auth cache..."
cd /var/www/clazz-crm
rm -rf .wwebjs_auth
rm -rf .wwebjs_cache

echo "🚀 Restarting Clazz CRM..."
pm2 start clazz-crm
pm2 logs clazz-crm --lines 50
