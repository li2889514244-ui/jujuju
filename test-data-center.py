"""Test MatrixFlow frontend - verify collected data is displayed"""
from playwright.sync_api import sync_playwright
import time

URL = "https://ddddkiii.com"
EMAIL = "2889514244@qq.com"
PASSWORD = "DY5p7eknNe0pdFiW"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    
    # Step 1: Go to site and login
    print("Step 1: Navigating to login...")
    page.goto(f"{URL}/login", wait_until="networkidle")
    time.sleep(2)
    
    # Fill login form
    page.fill('input[type="email"], input[placeholder*="邮箱"], input[name="email"]', EMAIL)
    page.fill('input[type="password"], input[placeholder*="密码"], input[name="password"]', PASSWORD)
    page.click('button[type="submit"], button:has-text("登")')
    time.sleep(3)
    
    # Step 2: Go to Dashboard first
    print("Step 2: Dashboard page...")
    page.goto(f"{URL}/dashboard", wait_until="networkidle")
    time.sleep(3)
    out = r"C:\Users\EDY\jujuju"
    page.screenshot(path=f"{out}\\screenshot-dashboard.png", full_page=True)
    print(f"Dashboard: {out}\\screenshot-dashboard.png")
    
    # Step 3: Navigate to Data Center
    print("Step 3: Data Center page...")
    page.goto(f"{URL}/data-center", wait_until="networkidle")
    time.sleep(5)
    page.screenshot(path=f"{out}\\screenshot-datacenter.png", full_page=True)
    print(f"DataCenter: {out}\\screenshot-datacenter.png")
    
    # Step 4: Go to Account Detail
    print("Step 4: Account Detail page...")
    page.goto(f"{URL}/accounts/cmpmi5c3a001hnu459ncdnhto", wait_until="networkidle")
    time.sleep(5)
    page.screenshot(path=f"{out}\\screenshot-account-detail.png", full_page=True)
    print(f"Account Detail: {out}\\screenshot-account-detail.png")
    
    # Check console errors
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    print("Console errors:", errors)
    
    browser.close()
    print("Done!")
