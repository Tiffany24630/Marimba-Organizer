# FASE 9G — Caducidad opcional de enlaces públicos

> Continúa `FASE_9E_PUBLIC_LINK.md` y la auditoría 9F. Sin commits, push,
> merges ni cambios de rama. RAMA: `checkpoint/fase1-motor-d1-d3-d5`,
> HEAD `3253c2a92b21d8a88919116048b92815a04b1e50`.

## 1. Estado general

```text
COMPLETADA
```

> **¿Existe alguna corrección obligatoria antes de continuar?**
> **NO — producto estable; puede comenzar el siguiente bloque.**

## 2. Objetivo

TTL/caducidad opcional para enlaces públicos. `expires_at = null` conserva
el comportamiento 9E; `expires_at` futuro es válido; `expires_at <= now`
responde 404 indistinguible de inexistente/revocado. Aditiva y localizada.

## 3. Modelo

- `PublicCompositionLink.expires_at`: `DateTime(timezone=True)`,
  nullable, sin default (enlaces 9E existentes quedan en `NULL`).
- Documentado en el docstring del modelo (semántica revocado/caduco).
- `revoked_at` intacto; token y hash intactos; `UNIQUE(composition_id)`
  intacto.

## 4. Semántica de expiración

```text
revoked_at != null  → revocado (404)
expires_at == null  → sin caducidad (comportamiento 9E)
expires_at > now    → activo (200)
expires_at <= now   → expirado (404, indistinguible)
```

Comparación en UTC con datetimes conscientes (`_ahora_utc()`); los valores
naive se asumen UTC. Sin comparaciones de strings.

## 5. API

- `POST /api/compositions/{cid}/public-link` acepta JSON opcional
  `{expires_at?: string|null}`. Ausente o `null` → sin caducidad.
  Futuro → se persiste. Pasado/igual-a-ahora → `422`.
  Formato inválido → `422`. Respuesta incluye `expires_at` (ISO o null).
- `GET /api/compositions/{cid}/public-link` (estado, owner) incluye
  `expires_at`.
- `GET /api/public/compositions/{token}` comprueba expiración en servidor;
  expirado → mismo 404 `{"detail":"Enlace no válido."}`. La proyección pública
  NO incluye `expires_at` (regla de acceso, no dato de representación).

## 6. Compatibilidad con enlaces 9E existentes

- Columna nullable sin default: filas 9E quedan en `NULL` = sin caducidad.
- Migración idempotente `_migrate_public_link_expiration()` en `main.py`
  (patrón 7C/7D): `ALTER TABLE ... ADD COLUMN` solo si falta; SQLite y
  PostgreSQL; nunca destructiva; sin tocar producción.
- Sin regenerar hashes ni URLs. Base nueva: `create_all` ya incluye el campo.

## 7. Frontend

- `PublicLinkPanel.tsx`: `input type="datetime-local"` opcional con label
  accesible (`Fecha de caducidad (opcional)`), ayuda, error accesible
  (`role="alert"`), validación local (fecha inválida/pasada bloquea el envío
  con mensaje), envío `{} `sin caducidad o `{expires_at: ISO UTC}` con ella.
  Estado muestra caducidad formateada o "Sin caducidad". Copiar/revocar
  intactos. Solo owner (montaje en `Project.tsx` sin cambios).
- `api.ts`: `createPublicLink(cid, expires_at?)` transmite el campo solo si
  se indica. `publicLink.ts`: helper `toExpiresAt()` (local →
  ISO-UTC) cubierto por tests.

## 8. Zona horaria / UTC

- Backend almacena y compara en UTC (`DateTime(timezone=True)`).
- Frontend convierte el valor local del `datetime-local` a ISO-UTC antes de
  enviar (helper `toExpiresAt`, con tests de ida y vuelta).
## 9. Pruebas backend

Suite nueva `backend/tests/test_caducidad_9g.py` — 14 tests, todos verdes:
creación (sin/futura/persistida/pasada-422/inválida-422), consulta
(200 sin, 200 futura, 404 expirada, indistinguible de inexistente, sin
datos internos), seguridad (editor/reader/ajeno/sin-sesión no administran),
revocación (expirado revocable; recrear con/sin caducidad; token viejo
muerto), aislamiento (A no afecta B; frontera `<= now` determinista sin
`sleep`: pasado manipulado en base + futuro relativo + `== now` vía
manipulación directa).

## 10. Pruebas frontend

`frontend/tests/caducidad9g.test.cjs` — 7 tests: `toExpiresAt` (local →
ISO-UTC, vacío → null, inválido → null, ida/vuelta sin pérdida > 1 min),
contrato `api.createPublicLink` (acepta `expires_at` opcional y no rompe la
llamada 9E sin segundoargumento), panel (input `datetime-local` con label,
ayuda de opcionalidad, error `role="alert"`, no envía fecha pasada).
Suite completa: 210 passed / 0 failed.

## 11. E2E

`frontend/e2e/specs/caducidad9g.spec.ts` — 4 tests: sin expiración (9E
intacto), expiración futura (página + axe 0), expiración alcanzada
(estrategia determinista: TTL de 2 s + `expect.poll` hasta 404; página
muestra "Este enlace no funciona" sin contenido), revocación con caducidad
de por medio (token viejo muerto, nuevo sin caducidad funciona).
Suite completa: 90 tests (86 + 4 nuevos).



