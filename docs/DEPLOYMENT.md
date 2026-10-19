# MicroMax Sugar ERP — Production Setup

For the mill's IT team and whoever runs the server. It covers:
- the server, the install and the Nginx / Supervisor / SSL setup
- the scheduler and workers, backups, monitoring
- the weighbridge PCs, the Android apps and the gateways
- updates and the go-live checklist

Commands assume Ubuntu 24.04 LTS and a Linux user `frappe` that owns the bench at `/home/frappe/frappe-bench`.

## 1. Server

| | Season peak (1,500+ loads a day, ~60 users) | Off-season / pilot |
|---|---|---|
| CPU | 8 vCPU | 4 vCPU |
| RAM | 32 GB (MariaDB buffer pool 12–16 GB) | 16 GB |
| Disk | 500 GB SSD (photos, PDFs, backups) | 250 GB SSD |
| Network | static IP on the mill LAN; the gate and weighbridge PCs reach it over the LAN, not the internet | |

- **Placement.** Put the server **at the mill** (or in a data centre with a reliable VPN to the mill). The weighbridge, gate and yard must keep working if the internet link drops.
- **Remote users.** Office users outside the mill, and the field Android apps, reach it over HTTPS.

## 2. Install

**System packages:**
```bash
sudo apt update && sudo apt install -y git python3.14-dev python3.14-venv redis-server mariadb-server \
  nginx supervisor curl xvfb libfontconfig wkhtmltopdf cron
# Node 20 + yarn for the React build
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs && sudo npm i -g yarn
sudo mysql_secure_installation
```

**MariaDB:** add to `/etc/mysql/mariadb.conf.d/99-erp.cnf`:
```ini
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
innodb_buffer_pool_size = 12G        # ~40 % of RAM
innodb_log_file_size = 1G
max_connections = 300
bind-address = 127.0.0.1             # the database is never on the network
```

**Bench, apps and site:**
```bash
sudo -iu frappe
pip install --user frappe-bench
bench init frappe-bench --frappe-branch version-16 && cd frappe-bench
bench get-app erpnext --branch version-16
bench get-app hrms --branch version-16
bench get-app whatsapp            # if WhatsApp messages are used
bench get-app mm_core <mm_core repo>
bench get-app sugarcane https://github.com/maqmalak/sugarcane
bench new-site erp.micromaxsugar.example --db-root-password … --admin-password …
bench --site erp.micromaxsugar.example install-app erpnext hrms mm_core sugarcane
bench --site erp.micromaxsugar.example set-config host_name https://erp.micromaxsugar.example
bench --site erp.micromaxsugar.example set-config sugar_app_url https://erp.micromaxsugar.example/sugar
cd apps/sugarcane/frontend && yarn install && yarn build && cd -
bench build && bench --site erp.micromaxsugar.example migrate
```

- **Encryption key.** Keep a copy of `sites/<site>/site_config.json` (its `encryption_key`) **with the backups**. Without it, stored passwords can't be read after a restore: bank, SMS, the inbound and biometric tokens, API secrets.
- **First setup.** On the first login, run the Sugar Setup and Sugar Settings pages: company, season, accounts.
- **Configuration.** `migrate` applies the Phase 7 configuration and the indexes by itself.
- **Demo data.** Don't run `sc-demo` on the production site.

## 3. Nginx, Supervisor and SSL

```bash
cd ~/frappe-bench
bench config dns_multitenant on
sudo bench setup production frappe     # writes the nginx and supervisor configs and starts everything
bench setup socketio && sudo supervisorctl restart all
sudo snap install --classic certbot
sudo certbot --nginx -d erp.micromaxsugar.example   # SSL; renews by itself
```

**Workers** (`sites/common_site_config.json`, then `bench setup supervisor && sudo supervisorctl reread && sudo supervisorctl update`):
```json
{"background_workers": 2, "gunicorn_workers": 9, "workers": {"long": {"timeout": 3600, "background_workers": 1}}}
```
Gunicorn workers = 2 × CPU + 1.

**Firewall:**
```bash
sudo ufw default deny incoming
sudo ufw allow from <office / VPN range> to any port 22
sudo ufw allow 80,443/tcp
sudo ufw enable
```
MariaDB (3306) and Redis (11000, 12000, 13000) are local only and are never opened.

**Weighbridge IP check.** The ERP accepts a weight only from the IP registered on its Weighbridge Terminal. The PCs must reach Nginx directly on the LAN, not through a NAT that hides their address. Nginx passes the client IP in `X-Forwarded-For`, and Frappe reads it.

**Security settings.** Once, on the production site:
```bash
bench --site erp.micromaxsugar.example execute sugarcane.setup.hardening.apply
```
It sets:
- a strong-password policy
- lock-out for 15 minutes after 5 wrong passwords
- 12-hour sessions
- **two-factor sign-in** (an authenticator app) for System Manager, Cane Admin, Cane Manager, Accounts Manager, Cane Accountant and HR Manager

It refuses to run on a site with demo data. `…hardening.report` shows what is set. Also set `developer_mode` and `allow_tests` to 0 in `site_config.json`.

## 4. Scheduler and jobs

```bash
bench --site erp.micromaxsugar.example enable-scheduler
bench --site erp.micromaxsugar.example scheduler status
```

The scheduler runs:

| When | Job |
|---|---|
| every few minutes | queued SMS / WhatsApp messages |
| 07:15 daily | auto-close of the previous crushing day |
| daily | indent expiry and expiry reminders; document-vault status |
| monthly | loan markup |
| ERPNext's own jobs | depreciation, auto attendance from biometric check-ins, reposts |

## 5. Backups

| What | How |
|---|---|
| **Nightly** | `deploy/backup.sh` from cron at 01:15: database + public + private files, compressed, kept 14 days on the server |
| **Off the server** | Set `REMOTE` (an rclone remote: S3, Backblaze B2, Google Drive, SFTP to the head office). One copy must be outside the mill. |
| **Encryption key** | `site_config.json` copied with the first backup and after any change |
| **Before every update** | `bench --site … backup --with-files` (see §9) |
| **Restore drill** | Monthly: `DB_ROOT_PASSWORD=… deploy/restore-drill.sh` restores the newest backup into a throw-away site, compares the CPR, GL and grower counts, then drops it. It must say `RESTORE DRILL PASSED`. |
| **During the season** | Optionally a second daily backup at 13:15 (same script) |

**Crontab** for `frappe`:
```
15 1 * * *  REMOTE=offsite:micromax-erp-backups /home/frappe/frappe-bench/apps/sugarcane/deploy/backup.sh >> /home/frappe/logs/sugar-backup.log 2>&1
*/5 * * * * /home/frappe/frappe-bench/apps/sugarcane/deploy/healthcheck.sh https://erp.micromaxsugar.example > /dev/null || echo "ERP health check failed" | mail -s "ERP" it@micromaxsugar.example
```

**Restoring for real:** follow the same steps the drill runs, without dropping the site:
1. `bench --site … restore <db.sql.gz> --with-public-files … --with-private-files …`
2. Put the saved `encryption_key` back in `site_config.json`.
3. `bench --site … migrate`

## 6. Monitoring

`GET /api/method/sugarcane.api.v1.health.status`:
- **For anyone:** `{"ok": true}`. Point Uptime Kuma or any HTTP monitor at it.
- **For a System Manager or Cane Admin** (API key or a signed-in session): every check with its detail. `deploy/healthcheck.sh` prints it.
- **Checks:**
  - database, Redis
  - the scheduler ran in the last 15 minutes
  - job queue depth
  - **last backup under 26 hours old**
  - disk over 10 GB free
  - errors in the last 24 h
  - every real weighbridge agent reporting in the last 2 minutes
  - past crushing days closed
  - no messages stuck in the queue

## 7. Weighbridge and gate PCs

- **Each indicator:**
  - a small PC (or the weighbridge PC) runs `sugarcane/weighbridge/agent/wb_agent.py` as the systemd service `deploy/sugarcane-wb-agent@.service`, one instance per indicator
  - it restarts by itself and needs `python3-serial` and `python3-requests`
  - copy `wb_agent.py` to `/opt/sugarcane/`
- **API user:** each terminal has its own API user (Weighbridge Terminal → API user) with the Gross / Tare Weighman role only.
  - Put its key and secret in `/etc/sugarcane/<name>.env` (chmod 600).
  - Register the PC's fixed IP on the terminal.
- **Frame format:** test it with the indicator's own output first. `wb_agent.py --simulate` checks the link without a scale.
- **Browsers:** gate, yard and weighbridge screens run in Chrome or Edge on those PCs (or on tablets), at `https://erp…/sugar/procurement/…`.

## 8. Android apps

**Release builds** are signed with the mill's own key:
```bash
cd apps/sugarcane/android
export JAVA_HOME=… ANDROID_HOME=…
./gradlew :eagleeye:assembleRelease :elp:assembleRelease -PsugarServer=https://erp.micromaxsugar.example
# eagleeye/build/outputs/apk/release/eagleeye-release.apk · elp/build/outputs/apk/release/elp-release.apk
```

- **The key:**
  - The keystore is `~/.micromax-keys/micromax-release.jks`. Its passwords are in `~/.gradle/gradle.properties` (`micromaxKeystore`, `micromaxKeystorePassword`, `micromaxKeyAlias`, `micromaxKeyPassword`).
  - **Keep two copies of the keystore and its password off this machine** (a safe, the head office). Without them a new version can't be installed over the old one, and every phone must uninstall and lose its unsynced data.
- **Distribution:** an MDM, or a download page on the ERP. The apps refuse plain HTTP except to the development addresses.
- **New phones** wait for a Cane Manager to approve them (Survey Device).

## 9. Updates

```bash
cd ~/frappe-bench
bench --site erp.micromaxsugar.example backup --with-files
bench --site erp.micromaxsugar.example set-maintenance-mode on      # outside crushing hours; never during a weighment
bench update --pull --patch --build --requirements      # or: git pull in apps/sugarcane, then:
cd apps/sugarcane/frontend && yarn install && yarn build && cd -
bench --site erp.micromaxsugar.example migrate
bench --site erp.micromaxsugar.example run-tests --app sugarcane    # on a staging copy, not the live site
sudo supervisorctl restart all
bench --site erp.micromaxsugar.example set-maintenance-mode off
```

Run the test suite on a **staging site** (a restored copy) before updating the live one; the tests write test records.

## 10. Gateways and integrations

| What | Where |
|---|---|
| SMS | ERPNext *SMS Settings* (the aggregator's HTTP API); Sugar Settings → SMS and WhatsApp → gateway "Frappe SMS Settings"; inbound URL `…/api/method/sugarcane.api.v1.sms.inbound?token=…` |
| WhatsApp | the whatsapp app's *WhatsApp Account*; templates approved by Meta |
| Biometric clocks | the device (or its middleware) posts to `…/api/method/sugarcane.mill_hr.hr.punch` with the Biometric Token; employees' *Attendance Device ID* = the device user ID |
| Email | ERPNext Email Account (outgoing) for reports and alerts |
| Bank files | downloaded from the payment scroll; uploaded to the bank portal by the accountant |

## 11. Go-live checklist

- [ ] Server sized as §1, Ubuntu patched, firewall on, SSL valid
- [ ] `site_config.json` (encryption key) stored with the backups
- [ ] Scheduler enabled; health check green; backups reaching the off-site copy; one restore drill passed
- [ ] Company, season, rates, circles, villages, growers and opening balances migrated and checked
- [ ] Users created per role with circle / depot permissions; Administrator password in a safe; no shared accounts
- [ ] Weighbridge agents installed, IPs registered, a test truck weighed on every bridge
- [ ] Android release APKs installed, phones approved, a test survey and an ELP load synced
- [ ] SMS gateway tested from the Messages page; quiet hours and daily cap set
- [ ] Bank letters and files checked with each bank; cheque layouts test-printed
- [ ] Staff trained with the role manuals (*Help* in the app; the source is `sugarcane/manuals/*.md`)
- [ ] Demo data absent from production (`is_demo` = 0 everywhere)
