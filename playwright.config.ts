import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',timeout:90000,use:{baseURL:'http://127.0.0.1:1420',viewport:{width:1440,height:1000},launchOptions:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}},webServer:{command:'npm run dev',url:'http://127.0.0.1:1420',reuseExistingServer:true}});
