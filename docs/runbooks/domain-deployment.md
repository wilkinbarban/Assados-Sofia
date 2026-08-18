# Domain deployment

The host has one shared ingress: `portfolio-nginx` in `/home/wilkin/proyectos/Portafolio`. Do not start a second listener on ports 80 or 443.

## Routing

The ingress joins `asados-app-private` and `asados-supabase-private`. It proxies the application to `asados-web:3000` and only the public Supabase data-plane routes to `api-gw:8000`. Studio, Meta, databases, Redis, and Evolution remain private.

Container addresses are ephemeral. The Asados HTTPS server must keep Docker's embedded resolver and variable-based upstreams:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
resolver_timeout 5s;

set $asados_api_upstream http://api-gw:8000;
set $asados_web_upstream http://asados-web:3000;
```

Both Asados `proxy_pass` directives must use these variables. A static hostname in `proxy_pass` is resolved when Nginx loads its configuration and can leave the ingress pointing to a stale IP after an upstream container is recreated.

## Certificate

Certificates and ACME challenges use the `portafolio_letsencrypt` and `portafolio_certbot-www` volumes. The certificate is renewed by the existing daily job:

```text
17 3 * * * /home/wilkin/proyectos/Trindade/scripts/renew-certbot.sh
```

Validate renewal without changing the live certificate:

```bash
cd /home/wilkin/proyectos/Portafolio
docker compose --profile ssl run --rm certbot renew \
  --cert-name casadeasados.duckdns.org --dry-run
```

## Verification

Check the exact certificate SAN, HTTP redirect, HTTPS response and headers, `/api/health/live`, `/api/health/ready`, Realtime WebSocket upgrade, administrative-route denial, loopback-only listeners, and Nginx/application logs after each ingress change.

### Verify upstream recreation without restarting the ingress

Record the ingress start timestamp, recreate the Web upstream, and wait for Docker DNS re-resolution:

```bash
cd /home/wilkin/proyectos/Portafolio
ingress_started_at="$(docker inspect portfolio-nginx --format '{{.State.StartedAt}}')"

cd /home/wilkin/proyectos/Asados
docker compose up -d --force-recreate web
sleep 12

curl --fail --silent --show-error --output /dev/null \
  https://casadeasados.duckdns.org/
curl --fail --silent --show-error \
  https://casadeasados.duckdns.org/api/health/live
curl --fail --silent --show-error \
  https://casadeasados.duckdns.org/api/health/ready

test "$ingress_started_at" = \
  "$(docker inspect portfolio-nginx --format '{{.State.StartedAt}}')"
```

The three requests must succeed, and the final comparison must return zero. Do not restart or recreate `portfolio-nginx` during this test: that would hide stale-DNS regressions instead of proving dynamic resolution.
