#!/usr/bin/env bash
# =====================================================================================================================
#  MicroMax Sugar Mills ERP — fresh production install on Ubuntu 24.04 LTS
#
#  Frappe v16.54.0 · ERPNext 16 · HRMS 16 · mm_core · sugarcane
#  Follows the forum guide "How to install ERPNext v16 on Ubuntu 24.04" (Python 3.14 via uv, Node 24 via nvm,
#  MariaDB 11.8, bench from uv), with production hardening of a few of its steps (see the notes marked NOTE).
#
#  Run as the Linux user that will own the bench (it must have sudo), NOT as root:
#
#      LETSENCRYPT_EMAIL=you@example.com bash install-production.sh
#
#      → https://cane.micromaxonline.uk        the Frappe site (desk at /desk)
#      → https://sugarcane.micromaxonline.uk   the React app (its / opens /sugar), served by the same site
#
#  Before running: point the DNS A records of both names at this server's public IP (Let's Encrypt checks them).
#  Without a domain:  SSL=0 REACT_DOMAIN= SITE=sugarcane.local bash install-production.sh
#
#  With the data of an existing site (a `bench backup --with-files` folder copied to the server):
#      RESTORE_DIR=~/sugarcane-data LETSENCRYPT_EMAIL=you@example.com bash install-production.sh
#  The folder holds *-database.sql.gz, *-files.tar, *-private-files.tar and *-site_config_backup.json.
#
#  Every value below can be overridden from the environment. The script can be re-run: finished steps are skipped.
#  Passwords are generated once and kept in ~/.frappe-install-secrets (mode 600). A full log goes to ~/install-production-*.log.
# =====================================================================================================================
set -Eeuo pipefail

# ------------------------------------------------------------------------------------------------ settings
FRAPPE_USER="${FRAPPE_USER:-maqmalak}"
HOME_DIR="${HOME_DIR:-/home/maqmalak}"
BENCH_NAME="${BENCH_NAME:-frappe-bench}"
BENCH_DIR="${HOME_DIR}/${BENCH_NAME}"

# NOTE: Frappe refuses a site with the same name as an app on the bench ("Your bench has an app called sugarcane,
# please choose another name for the site"), so the site cannot be called plain "sugarcane"; it is named after its host.
SITE="${SITE:-cane.micromaxonline.uk}"                   # Frappe site = its public host name (desk, API)
REACT_DOMAIN="${REACT_DOMAIN-sugarcane.micromaxonline.uk}" # React app host, served by the same site; empty = none
SSL="${SSL:-1}"                                          # 1 = Let's Encrypt certificate for SITE and REACT_DOMAIN
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"               # needed with SSL=1: certificate expiry notices go here

FRAPPE_REPO="${FRAPPE_REPO:-https://github.com/frappe/frappe}"
FRAPPE_BRANCH="${FRAPPE_BRANCH:-v16.54.0}"            # a tag: the exact Frappe release
ERPNEXT_BRANCH="${ERPNEXT_BRANCH:-version-16}"
HRMS_BRANCH="${HRMS_BRANCH:-version-16}"
MM_CORE_REPO="${MM_CORE_REPO:-https://github.com/maqmalak/mm_core.git}"   # sugarcane imports mm_core: required
MM_CORE_BRANCH="${MM_CORE_BRANCH:-main}"
SUGARCANE_REPO="${SUGARCANE_REPO:-https://github.com/maqmalak/sugarcane.git}"
SUGARCANE_BRANCH="${SUGARCANE_BRANCH:-main}"
WHATSAPP_REPO="${WHATSAPP_REPO:-https://github.com/frappe/whatsapp}"     # installed on the source site, so needed for a restore
WHATSAPP_BRANCH="${WHATSAPP_BRANCH:-main}"
RESTORE_DIR="${RESTORE_DIR:-}"               # a backup folder: restore its data into the new site (see the top)

PYTHON_VERSION="${PYTHON_VERSION:-3.14}"
NODE_VERSION="${NODE_VERSION:-24}"
MARIADB_VERSION="${MARIADB_VERSION:-11.8}"   # from the MariaDB repository; set to "" to use Ubuntu's own MariaDB
TIMEZONE="${TIMEZONE:-Asia/Karachi}"
ENABLE_UFW="${ENABLE_UFW:-1}"                # firewall: only SSH, HTTP and HTTPS
HARDEN="${HARDEN:-0}"                        # 1 = run sugarcane's production hardening (turns on 2FA for managers)

SECRETS="${HOME_DIR}/.frappe-install-secrets"
LOG="${HOME_DIR}/install-production-$(date +%Y%m%d-%H%M%S).log"

# ------------------------------------------------------------------------------------------------ helpers
exec > >(tee -a "$LOG") 2>&1
STEP=0
step() { STEP=$((STEP + 1)); printf '\n\033[1;36m══ %02d · %s\033[0m\n' "$STEP" "$*"; }
info() { printf '   \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '   \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }
trap 'die "Failed at line $LINENO (step $STEP). See $LOG"' ERR

load_env() {
	export PATH="${HOME_DIR}/.local/bin:${PATH}"
	export NVM_DIR="${HOME_DIR}/.nvm"
	if [ -s "$NVM_DIR/nvm.sh" ]; then
		set +u   # nvm reads unset variables
		# shellcheck disable=SC1091
		. "$NVM_DIR/nvm.sh"
		nvm use "$NODE_VERSION" >/dev/null 2>&1 || true
		set -u
	fi
}

secret() {  # secret NAME → value, generated once and kept in $SECRETS
	local name="$1" val
	touch "$SECRETS" && chmod 600 "$SECRETS"
	val="$(grep -E "^${name}=" "$SECRETS" | cut -d= -f2- || true)"
	if [ -z "$val" ]; then
		val="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
		echo "${name}=${val}" >>"$SECRETS"
	fi
	printf '%s' "$val"
}

# ------------------------------------------------------------------------------------------------ 0. checks
step "Checks"
[ "$(id -u)" -ne 0 ] || die "Run this as ${FRAPPE_USER}, not as root (it uses sudo where needed)."
[ "$(id -un)" = "$FRAPPE_USER" ] || die "Run this as ${FRAPPE_USER} (now: $(id -un)), or set FRAPPE_USER."
[ "$HOME" = "$HOME_DIR" ] || warn "HOME is $HOME, the bench goes to $HOME_DIR"
sudo -v || die "${FRAPPE_USER} needs sudo."
. /etc/os-release
[ "${VERSION_ID:-}" = "24.04" ] || warn "This script is written for Ubuntu 24.04; found ${PRETTY_NAME:-unknown}."
case "$(dpkg --print-architecture)" in
	amd64) ARCH=amd64 ;; arm64) ARCH=arm64 ;; *) die "Unsupported CPU architecture $(dpkg --print-architecture)" ;;
esac
if [ "$SSL" = "1" ]; then
	[ -n "$LETSENCRYPT_EMAIL" ] || die "Set LETSENCRYPT_EMAIL=… for the SSL certificate (or SSL=0 to install without SSL)."
	case "$LETSENCRYPT_EMAIL" in *@example.com|*@example.org|*@localhost|*@*.local) die "LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL} is a placeholder — Let's Encrypt refuses it. Use a real address.";; esac
	PUBLIC_IP="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
	for host in "$SITE" ${REACT_DOMAIN:+"$REACT_DOMAIN"}; do
		DNS_IP="$(getent ahostsv4 "$host" | awk 'NR==1{print $1}')"
		if [ -z "$DNS_IP" ]; then
			warn "${host} does not resolve yet — add its DNS A record, or the SSL step will fail."
		elif [ -n "$PUBLIC_IP" ] && [ "$DNS_IP" != "$PUBLIC_IP" ]; then
			warn "${host} points to ${DNS_IP}, this server is ${PUBLIC_IP} — the SSL step will fail until DNS is updated."
		else
			info "${host} → ${DNS_IP}"
		fi
	done
fi
if [ -n "$RESTORE_DIR" ]; then
	[ -d "$RESTORE_DIR" ] || die "RESTORE_DIR ${RESTORE_DIR} does not exist — copy the backup folder to this server first."
	ls "$RESTORE_DIR"/*-database.sql* >/dev/null 2>&1 || die "No *-database.sql.gz in ${RESTORE_DIR}."
	info "restore from ${RESTORE_DIR}: $(ls "$RESTORE_DIR" | tr '\n' ' ')"
fi
GIT_TERMINAL_PROMPT=0 git ls-remote "$SUGARCANE_REPO" HEAD >/dev/null 2>&1 || warn "Cannot reach $SUGARCANE_REPO yet (git may not be installed); checked again later."
info "user ${FRAPPE_USER} · bench ${BENCH_DIR} · site ${SITE} · Frappe ${FRAPPE_BRANCH} · ${ARCH}"
( while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done ) 2>/dev/null &   # keep sudo alive

# ------------------------------------------------------------------------------------------------ 1. server
step "Server: time zone and system update"
sudo timedatectl set-timezone "$TIMEZONE" || warn "could not set the time zone"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
info "$(date)"

# ------------------------------------------------------------------------------------------------ 2. packages
step "Packages"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
	git curl wget ca-certificates gnupg openssl cron software-properties-common \
	python3-dev python3-pip python3-setuptools python3-venv \
	build-essential pkg-config libmysqlclient-dev libffi-dev libssl-dev \
	xvfb libfontconfig fontconfig xfonts-75dpi xfonts-base \
	redis-server nginx supervisor ansible ufw
info "git $(git --version | awk '{print $3}') · redis $(redis-server --version | awk '{print $3}')"

step "wkhtmltopdf (patched Qt, for PDF prints)"
if wkhtmltopdf --version 2>/dev/null | grep -q "with patched qt"; then
	info "already installed: $(wkhtmltopdf --version)"
else
	deb="wkhtmltox_0.12.6.1-2.jammy_${ARCH}.deb"
	wget -q -O "/tmp/${deb}" "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-2/${deb}"
	sudo dpkg -i "/tmp/${deb}" || sudo DEBIAN_FRONTEND=noninteractive apt-get -f install -y
	sudo dpkg -i "/tmp/${deb}"
	info "$(wkhtmltopdf --version)"
fi

# ------------------------------------------------------------------------------------------------ 3. python
step "Python ${PYTHON_VERSION} (uv)"
if ! command -v uv >/dev/null 2>&1 && [ ! -x "${HOME_DIR}/.local/bin/uv" ]; then
	curl -LsSf https://astral.sh/uv/install.sh | sh
fi
load_env
uv python install "$PYTHON_VERSION" --default || uv python install "$PYTHON_VERSION"
PYTHON_BIN="$(env -u VIRTUAL_ENV uv python find --managed-python "$PYTHON_VERSION")"   # never an active virtualenv
info "uv $(uv --version | awk '{print $2}') · $("$PYTHON_BIN" --version) at ${PYTHON_BIN}"

# ------------------------------------------------------------------------------------------------ 4. mariadb
step "MariaDB ${MARIADB_VERSION:-from Ubuntu}"
if ! command -v mariadb >/dev/null 2>&1; then
	if [ -n "$MARIADB_VERSION" ]; then
		curl -LsS https://r.mariadb.com/downloads/mariadb_repo_setup | sudo bash -s -- --mariadb-server-version="mariadb-${MARIADB_VERSION}" --skip-maxscale
		sudo apt-get update -y
	fi
	sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
fi
sudo tee /etc/mysql/mariadb.conf.d/99-frappe.cnf >/dev/null <<'CNF'
# Frappe / ERPNext (written by install-production.sh)
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
bind-address = 127.0.0.1
innodb_file_per_table = 1
innodb_buffer_pool_size = 1G
max_allowed_packet = 256M

[mysql]
default-character-set = utf8mb4
CNF
sudo systemctl enable --now mariadb
sudo systemctl restart mariadb
# Non-interactive mysql_secure_installation: root by password (bench uses it) or by the unix socket; no anonymous
# users, no remote root, no test database.
DB_ROOT_PASSWORD="$(secret DB_ROOT_PASSWORD)"
if sudo mariadb -e "SELECT 1" >/dev/null 2>&1; then
	sudo mariadb <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED VIA unix_socket OR mysql_native_password USING PASSWORD('${DB_ROOT_PASSWORD}');
DELETE FROM mysql.global_priv WHERE User='';
DELETE FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
SQL
fi
mariadb -uroot -p"$DB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null || die "MariaDB root password check failed (see $SECRETS)."
info "$(mariadb --version)"

# ------------------------------------------------------------------------------------------------ 5. node
step "Node ${NODE_VERSION} (nvm) and yarn"
if [ ! -s "${HOME_DIR}/.nvm/nvm.sh" ]; then
	curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
load_env
set +u
nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use "$NODE_VERSION"
set -u
command -v yarn >/dev/null 2>&1 || npm install -g yarn
info "node $(node --version) · npm $(npm --version) · yarn $(yarn --version)"
# supervisor runs `bench socketio`, which looks for node on the system PATH; nvm's node lives in the home folder.
sudo ln -sf "$(command -v node)" /usr/local/bin/node

# ------------------------------------------------------------------------------------------------ 6. bench
step "bench CLI"
command -v bench >/dev/null 2>&1 || uv tool install frappe-bench
# Later logins need ~/.local/bin (bench, uv) on the PATH too, not only this script.
grep -q 'HOME/.local/bin' "${HOME_DIR}/.bashrc" 2>/dev/null ||
	echo 'export PATH="$HOME/.local/bin:$PATH"' >>"${HOME_DIR}/.bashrc"
load_env
info "bench $(bench --version 2>/dev/null)"

step "bench init: Frappe ${FRAPPE_BRANCH}"
if [ -d "${BENCH_DIR}/apps/frappe" ]; then
	info "${BENCH_DIR} exists — skipping init"
else
	cd "$HOME_DIR"
	bench init "$BENCH_NAME" --frappe-path "$FRAPPE_REPO" --frappe-branch "$FRAPPE_BRANCH" --python "$PYTHON_BIN" --verbose
fi
cd "$BENCH_DIR"
info "frappe $(git -C apps/frappe describe --tags 2>/dev/null || true)"

# ------------------------------------------------------------------------------------------------ 7. apps
step "Apps: erpnext, hrms, whatsapp, mm_core, sugarcane"
get_app() {  # get_app NAME REPO BRANCH
	if [ -d "apps/$1" ]; then info "$1 already in apps/"; return; fi
	bench get-app --branch "$3" "$2"
}
get_app erpnext https://github.com/frappe/erpnext "$ERPNEXT_BRANCH"
get_app hrms https://github.com/frappe/hrms "$HRMS_BRANCH"
get_app mm_core "$MM_CORE_REPO" "$MM_CORE_BRANCH"
get_app whatsapp "$WHATSAPP_REPO" "$WHATSAPP_BRANCH"
get_app sugarcane "$SUGARCANE_REPO" "$SUGARCANE_BRANCH"
for a in frappe erpnext hrms whatsapp mm_core sugarcane; do info "$a  $(git -C "apps/$a" describe --tags --always 2>/dev/null)"; done

# ------------------------------------------------------------------------------------------------ 8. site
step "Site ${SITE}"
ADMIN_PASSWORD="$(secret ADMIN_PASSWORD)"
if [ -d "sites/${SITE}" ] && ! bench --site "$SITE" list-apps >/dev/null 2>&1; then
	warn "sites/${SITE} is left over from a failed run (its database does not answer) — removing it"
	bench drop-site "$SITE" --db-root-username root --db-root-password "$DB_ROOT_PASSWORD" --force --no-backup 2>/dev/null || true
	rm -rf "sites/${SITE}"
fi
if [ -d "sites/${SITE}" ]; then
	info "site exists — skipping new-site"
else
	bench new-site "$SITE" --db-root-username root --db-root-password "$DB_ROOT_PASSWORD" \
		--admin-password "$ADMIN_PASSWORD" --set-default
fi
if [ -n "$RESTORE_DIR" ] && [ ! -f "sites/${SITE}/.restored" ]; then
	step "Restore data from ${RESTORE_DIR}"
	pick() { find "$RESTORE_DIR" -maxdepth 1 -name "$1" | sort | tail -1; }
	DB_FILE="$(pick '*-database.sql.gz')"; [ -n "$DB_FILE" ] || DB_FILE="$(pick '*-database.sql')"
	PUB_FILE="$(pick '*-files.tar')"; PRIV_FILE="$(pick '*-private-files.tar')"; CFG_FILE="$(pick '*site_config_backup.json')"
	[ -n "$DB_FILE" ] || die "No *-database.sql.gz in ${RESTORE_DIR}"
	info "database ${DB_FILE##*/}${PUB_FILE:+ · ${PUB_FILE##*/}}${PRIV_FILE:+ · ${PRIV_FILE##*/}}"
	# The same encryption key, or the stored passwords (email accounts, API secrets, bank details) cannot be read.
	if [ -n "$CFG_FILE" ]; then
		KEY="$("$PYTHON_BIN" -c "import json,sys; print(json.load(open(sys.argv[1])).get('encryption_key',''))" "$CFG_FILE")"
		if [ -n "$KEY" ]; then bench --site "$SITE" set-config encryption_key "$KEY"; info "encryption key carried over"; fi
	else
		warn "no site_config_backup.json: stored passwords of the old site will not decrypt"
	fi
	bench --site "$SITE" restore "$DB_FILE" ${PUB_FILE:+--with-public-files "$PUB_FILE"} ${PRIV_FILE:+--with-private-files "$PRIV_FILE"} \
		--db-root-username root --db-root-password "$DB_ROOT_PASSWORD" --force
	bench --site "$SITE" set-admin-password "$ADMIN_PASSWORD"   # Administrator gets this server's password (see $SECRETS)
	touch "sites/${SITE}/.restored"
	info "restored; Administrator password reset — other users keep their passwords from the old site"
fi
installed="$(bench --site "$SITE" list-apps 2>/dev/null || true)"
for a in erpnext hrms whatsapp mm_core sugarcane; do
	if grep -qw "^$a" <<<"$installed"; then info "$a already installed"; else bench --site "$SITE" install-app "$a"; fi
done
SCHEME="http"; [ "$SSL" = "1" ] && SCHEME="https"
BASE_URL="${SCHEME}://${SITE}"
REACT_URL="${SCHEME}://${REACT_DOMAIN:-$SITE}/sugar"
bench --site "$SITE" set-config host_name "$BASE_URL"
bench --site "$SITE" set-config sugar_app_url "$REACT_URL"   # QR codes on prints open the React app
bench --site "$SITE" set-config developer_mode 0
# migrate needs the bench's Redis, which supervisor only runs after step 9: start it here for a moment.
TMP_REDIS=()
for conf in config/redis_cache.conf config/redis_queue.conf; do
	port="$(awk '$1=="port"{print $2}' "$conf")"
	if ! redis-cli -p "$port" ping >/dev/null 2>&1; then
		redis-server "$conf" --daemonize yes >/dev/null && TMP_REDIS+=("$port")
	fi
done
for _ in 1 2 3 4 5 6 7 8 9 10; do redis-cli -p "$(awk '$1=="port"{print $2}' config/redis_cache.conf)" ping >/dev/null 2>&1 && break; sleep 1; done
bench --site "$SITE" migrate
bench build --production
for port in "${TMP_REDIS[@]}"; do redis-cli -p "$port" shutdown nosave >/dev/null 2>&1 || true; done
info "apps on ${SITE}: $(bench --site "$SITE" list-apps | tr '\n' ' ')"

# ------------------------------------------------------------------------------------------------ 9. production
step "Production: scheduler, nginx, supervisor"
bench config dns_multitenant on            # nginx picks the site by host name
bench --site "$SITE" enable-scheduler
bench --site "$SITE" set-maintenance-mode off
sudo env "PATH=$PATH" bench setup production "$FRAPPE_USER" --yes
bench setup nginx --yes --log_format combined
if ! sudo supervisorctl status 2>/dev/null | grep -q "${BENCH_NAME}"; then
	warn "supervisor did not pick up the bench — linking its config"
	sudo ln -sf "${BENCH_DIR}/config/supervisor.conf" "/etc/supervisor/conf.d/${BENCH_NAME}.conf"
	sudo supervisorctl reread && sudo supervisorctl update
fi
# NOTE: the guide runs `chmod -R o+rx` on the whole home folder. That also makes ~/.ssh keys world-readable (ssh then
# refuses them) and exposes site_config.json with the database password. nginx only needs to walk into the bench and
# read the apps' public files, so only that is opened.
chmod o+x "$HOME_DIR" "$BENCH_DIR" "${BENCH_DIR}/sites"
chmod -R o+rX "${BENCH_DIR}/sites/assets" "${BENCH_DIR}"/apps/*/*/public 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx
sudo supervisorctl restart all || warn "a process did not start — see: sudo supervisorctl status, and ~/frappe-bench/logs/"
sudo supervisorctl status || true

# ------------------------------------------------------------------------------------------------ 10. react host
# The React app is built into sugarcane (served at /sugar). REACT_DOMAIN gets its own nginx server block that sends every
# request to the same Frappe site (X-Frappe-Site-Name), and opens /sugar at its root. It lives in its own file, so
# `bench setup nginx` (which rewrites the bench's nginx.conf) never touches it.
REACT_CONF="/etc/nginx/conf.d/${REACT_DOMAIN}.conf"
react_nginx() {  # react_nginx [CERT_DIR] — writes the React host's server block (with SSL when a certificate is given)
	local cert="${1:-}" listen="listen 80; listen [::]:80;" tls="" redirect=""
	if [ -n "$cert" ]; then
		listen="listen 443 ssl; listen [::]:443 ssl;"
		tls="ssl_certificate ${cert}/fullchain.pem; ssl_certificate_key ${cert}/privkey.pem;
	ssl_protocols TLSv1.2 TLSv1.3; ssl_session_cache shared:SSL_react:10m; ssl_session_timeout 5m;
	add_header Strict-Transport-Security \"max-age=63072000; includeSubDomains\";"
		redirect="server { listen 80; listen [::]:80; server_name ${REACT_DOMAIN}; return 301 https://\$host\$request_uri; }"
	fi
	sudo tee "$REACT_CONF" >/dev/null <<NGINX
# ${REACT_DOMAIN} → React app of ${SITE} (written by install-production.sh; bench does not manage this file)
server {
	${listen}
	server_name ${REACT_DOMAIN};
	root ${BENCH_DIR}/sites;
	${tls}
	add_header X-Frame-Options "SAMEORIGIN";
	add_header X-Content-Type-Options nosniff;
	add_header Referrer-Policy "same-origin, strict-origin-when-cross-origin";
	client_max_body_size 50m;
	proxy_buffer_size 128k; proxy_buffers 4 256k; proxy_busy_buffers_size 256k;
	gzip on; gzip_proxied any; gzip_vary on; gzip_min_length 256;
	gzip_types application/javascript application/json text/css text/plain image/svg+xml application/xml;

	location = / { return 302 /sugar; }
	location /assets { try_files \$uri =404; add_header Cache-Control "max-age=31536000"; }
	location ~ ^/protected/(.*) { internal; try_files /${SITE}/\$1 =404; }
	location /socket.io {
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_set_header X-Frappe-Site-Name ${SITE};
		proxy_set_header Origin \$scheme://\$http_host;
		proxy_set_header Host \$host;
		proxy_pass http://${BENCH_NAME}-socketio-server;
	}
	location / {
		location ~* ^/files/.*.(htm|html|svg|xml) { add_header Content-disposition "attachment"; try_files /${SITE}/public/\$uri @webserver; }
		try_files /${SITE}/public/\$uri @webserver;
	}
	location @webserver {
		proxy_http_version 1.1;
		proxy_set_header X-Forwarded-For \$remote_addr;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_set_header X-Frappe-Site-Name ${SITE};
		proxy_set_header Host \$host;
		proxy_set_header X-Use-X-Accel-Redirect True;
		proxy_read_timeout 120;
		proxy_redirect off;
		proxy_pass http://${BENCH_NAME}-frappe;
	}
}
${redirect}
NGINX
	sudo nginx -t && sudo systemctl reload nginx
}
if [ -n "$REACT_DOMAIN" ]; then
	step "React host ${REACT_DOMAIN} → ${SITE}/sugar"
	react_nginx
	info "nginx: ${REACT_CONF}"
fi

# ------------------------------------------------------------------------------------------------ 11. ssl
if [ "$SSL" = "1" ]; then
	step "SSL (Let's Encrypt): ${SITE}${REACT_DOMAIN:+, ${REACT_DOMAIN}}"
	command -v certbot >/dev/null 2>&1 || { sudo snap install core; sudo snap refresh core; sudo snap install --classic certbot; sudo ln -sf /snap/bin/certbot /usr/bin/certbot; }
	# One certificate for both names. `certonly` leaves the nginx files alone; the certificate goes into the site's config
	# so a later `bench setup nginx` keeps SSL, and every renewal reloads nginx.
	sudo certbot certonly --nginx --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --cert-name "$SITE" \
		-d "$SITE" ${REACT_DOMAIN:+-d "$REACT_DOMAIN"} --deploy-hook "systemctl reload nginx"
	CERT_DIR="/etc/letsencrypt/live/${SITE}"
	bench --site "$SITE" set-config ssl_certificate "${CERT_DIR}/fullchain.pem"
	bench --site "$SITE" set-config ssl_certificate_key "${CERT_DIR}/privkey.pem"
	bench setup nginx --yes --log_format combined
	[ -z "$REACT_DOMAIN" ] || react_nginx "$CERT_DIR"
	sudo nginx -t && sudo systemctl reload nginx
	sudo certbot renew --dry-run --cert-name "$SITE" >/dev/null && info "automatic renewal works"
fi

# ------------------------------------------------------------------------------------------------ 12. firewall
if [ "$ENABLE_UFW" = "1" ]; then
	step "Firewall (ufw): SSH, HTTP, HTTPS only"
	# NOTE: the guide also opens 3306 (MariaDB) and 8000 (bench dev server). In production MariaDB stays on 127.0.0.1
	# and nginx serves the site on 80/443, so neither is opened.
	sudo ufw allow OpenSSH
	sudo ufw allow 80/tcp
	sudo ufw allow 443/tcp
	sudo ufw --force enable
	sudo ufw status verbose | head -12
fi

# ------------------------------------------------------------------------------------------------ 13. hardening
if [ "$HARDEN" = "1" ]; then
	step "Sugarcane production hardening"
	bench --site "$SITE" execute sugarcane.setup.hardening.apply
fi

# ------------------------------------------------------------------------------------------------ done
step "Done"
bench version --format table || bench version
URL="$BASE_URL"
cat <<EOF

  Frappe      ${URL}            (desk: ${URL}/desk)
  React app   ${REACT_URL}
  Login       Administrator / password in ${SECRETS}
  Bench       ${BENCH_DIR}
  Log         ${LOG}

  Next:
   1. New site only (no RESTORE_DIR): open ${URL}/desk and finish the ERPNext setup wizard; then Sugar Settings →
      Company → choose it, save, and run: cd ${BENCH_DIR} && bench --site ${SITE} migrate
   2. Restored site: sign in and check the data; users keep their old passwords.
   3. Production checklist: ${BENCH_DIR}/apps/sugarcane/docs/DEPLOYMENT.md (backups, workers, gate PCs, Android apps).
   4. When users are set up (and demo data is removed — hardening refuses a site with demo records): HARDEN=1 bash install-production.sh, or
        bench --site ${SITE} execute sugarcane.setup.hardening.apply
EOF
[ "$SSL" = "1" ] || echo "  No SSL: add '${SITE}'${REACT_DOMAIN:+ and '${REACT_DOMAIN}'} to the hosts file of the PCs that use it, or re-run with SSL=1."
