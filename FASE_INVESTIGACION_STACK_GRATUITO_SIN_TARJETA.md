# FASE — INVESTIGACIÓN Y SELECCIÓN DE STACK GRATUITO SIN TARJETA

Fecha de consulta: 2026-10-08

## 1. Resultado

**ESTADO: COMPLETADA**

La investigación no demuestra una combinación que cumpla simultáneamente y sin condiciones:

```text
$0 permanente
sin tarjeta
FastAPI/Python sin adaptación relevante
PostgreSQL
GitHub
HTTPS
secrets
```

Por tanto, no se recomienda declarar todavía una arquitectura de producción como plenamente aprobada.

La opción técnicamente más cercana para una demo personal es:

```text
Frontend + FastAPI: Vercel
PostgreSQL: Neon Free
```

pero queda condicionada a confirmar durante el alta que no se solicita tarjeta y a aceptar las condiciones del plan Hobby de Vercel, que está limitado a uso personal/no comercial. No se creó ninguna cuenta ni infraestructura.

## 2. Restricciones respetadas

- No se desplegó producción.
- No se crearon cuentas, bases, tenants ni usuarios.
- No se solicitaron contraseñas, tarjetas, tokens ni API keys.
- No se modificó código, configuración ni datos.
- No se ejecutaron migraciones externas ni `create-admin`.
- Este documento queda local y no se añadió al staging.

Estado Git de referencia conservado:

```text
Rama: checkpoint/fase1-motor-d1-d3-d5
Upstream: origin/checkpoint/fase1-motor-d1-d3-d5
HEAD: e0969172c2cbcc10a078d8faf2e12f9832a09eb5
```

## 3. Fuentes oficiales consultadas

- Netlify pricing y planes: https://www.netlify.com/pricing/ y https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- Netlify Functions: https://docs.netlify.com/build/functions/overview/
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Workers pricing/limits: https://developers.cloudflare.com/workers/platform/pricing/ y https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Python Workers: https://developers.cloudflare.com/workers/languages/python/how-python-workers-work/
- Vercel pricing/plans: https://vercel.com/pricing y https://vercel.com/docs/plans/hobby
- Vercel FastAPI/Python: https://vercel.com/docs/frameworks/backend/fastapi y https://vercel.com/docs/functions/runtimes/python
- Railway trial: https://docs.railway.com/pricing/free-trial
- Koyeb pricing FAQ: https://www.koyeb.com/docs/faqs/pricing
- Hugging Face Spaces: https://huggingface.co/docs/hub/spaces-overview
- PythonAnywhere pricing: https://www.pythonanywhere.com/pricing/
- Neon plans: https://neon.tech/docs/introduction/plans
- Neon connection URI: https://api-docs.neon.tech/reference/getconnectionuri
- Supabase pricing/billing: https://supabase.com/pricing y https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase PostgreSQL connections: https://supabase.com/docs/guides/database/connecting-to-postgres
- Fly.io pricing: https://fly.io/docs/about/pricing/

Las características comerciales y los límites pueden cambiar. Antes de crear infraestructura debe repetirse la comprobación en la pantalla de alta y en la documentación vigente.

## 4. Frontend

| Plataforma | Free | Sin tarjeta | GitHub | React/Vite | HTTPS | Secrets | Observación |
|---|---|---|---|---|---|---|---|
| Netlify | Sí, plan Free con créditos limitados | La documentación indica uso gratuito sin tarjeta para la mayoría de funciones, pero la política actual de alta debe verificarse | Sí | Sí | Sí | Sí | Buena opción de frontend; no ejecuta el backend FastAPI existente como un Web Service Docker |
| Cloudflare Pages | Sí | No se encontró una garantía explícita de alta sin tarjeta en la documentación consultada | Sí | Sí | Sí | Sí | Muy adecuada para el `dist` estático; Pages Functions tienen límites de Workers |
| Vercel | Sí, Hobby | La documentación actual no lo garantiza de forma inequívoca; una política oficial anterior indica que la tarjeta no se exige hasta contratar un plan pago | Sí | Sí | Sí | Sí | También soporta FastAPI como Python Function; Hobby es personal/no comercial |

Netlify y Cloudflare Pages son opciones sólidas para el frontend estático. Ninguna resuelve por sí sola el alojamiento del backend FastAPI actual.

## 5. Backend FastAPI/Python

| Plataforma | Free/$0 | Sin tarjeta | FastAPI | Docker | GitHub | HTTPS/secrets | Limitaciones relevantes | Compatibilidad |
|---|---|---|---|---|---|---|---|
| Vercel Functions | Sí, Hobby | Condicionado a verificación del alta | Sí, runtime Python y FastAPI documentados | No es el modelo Docker actual | Sí | Sí | Una sola Function, bundle Python máximo documentado de 500 MB, límites de Functions y restricción personal/no comercial | Alta para demo, con adaptación de entrypoint/configuración |
| Railway Trial/Free | Trial inicial con créditos; Free posterior con crédito mensual limitado | El trial puede iniciarse sin tarjeta en el flujo documentado, pero la verificación y el acceso dependen de la cuenta/GitHub | Sí | Sí | Sí | Sí | El trial dura hasta 30 días o hasta consumir créditos; los datos de cuentas trial tienen retención limitada; no es una garantía de $0 permanente | Alta durante trial; no cumple como solución estable sin condiciones |
| Koyeb Free Instance | Sí | **No**: Koyeb exige tarjeta para validar la cuenta | Sí | Sí | Sí | Sí | Una instancia gratuita, escala a cero tras una hora sin tráfico y está limitada a una región | Descartada por tarjeta |
| Hugging Face Spaces | Static gratis; Docker requiere plan/compute pagado para cuentas personales | No sirve como backend Docker gratuito confirmado | Docker puede servir FastAPI, pero requiere compute de pago para este caso | Sí | Sí | Sí | El plan gratuito personal no ofrece Docker Space con compute gratuito permanente | Descartada |
| PythonAnywhere Free | Web app limitada | No resuelve PostgreSQL externo | Python sí | No como Docker Web Service equivalente | No es el flujo principal | Limitado | PostgreSQL y acceso externo requieren cuenta paga; internet saliente gratuito está restringido | Descartada |
| Fly.io | No para este requisito | **No**: requiere tarjeta para organizaciones no vinculadas | Sí | Sí | Sí | Sí | Uso por consumo y tarjeta obligatoria | Descartada |
| Cloudflare Workers | Sí, con cuota gratuita | No se confirmó una garantía de alta sin tarjeta | Python Workers existe, pero usa Pyodide/Workers runtime | No ejecuta este contenedor Docker | Sí | Sí | Requiere adaptar FastAPI al modelo Worker/ASGI compatible; límites de Workers y APIs diferentes | Cambio arquitectónico mayor |
| Netlify Functions | Sí | Free posible | No ejecuta directamente este backend FastAPI/Docker | No | Sí | Sí | El modelo es una función serverless con runtimes propios; exigiría reescritura/adaptación | No recomendada para backend |

## 6. PostgreSQL

| Servicio | Free | Sin tarjeta | PostgreSQL real | `DATABASE_URL` | Conexiones externas | Suspensión | Persistencia/backups | Región/límites |
|---|---|---|---|---|---|---|---|---|
| Neon Free | Sí; planes gratuitos con límites de proyectos, cómputo, almacenamiento y egress | La documentación oficial de Neon ha indicado que el free tier no requiere tarjeta; verificar el flujo actual antes de alta | Sí | Sí, URI PostgreSQL estándar | Sí; incluye URI directa y pooled | Escala a cero tras inactividad | Persistencia del proyecto; no debe confundirse con una estrategia de backup productiva | Límites gratuitos publicados; regiones según disponibilidad |
| Supabase Free | Sí; hasta dos proyectos activos y 500 MB por proyecto según documentación actual | No confirmado inequívocamente por las fuentes consultadas | Sí | Sí | Sí, conexión directa/pooler | Pausa por baja actividad durante aproximadamente una semana | Backups diarios y PITR son características de planes pagos; Free tiene pausa y límites | 5 GB egress, 500 MB DB, cuotas de uso |
| Railway PostgreSQL | Incluido en trial/free con límites de crédito | Condicionado al tipo de trial/cuenta | Sí | Sí | Sí | Recursos trial y límites de crédito; retención de trial limitada | No asumir backups adecuados para producción | Límites de crédito y consumo |

Para una demo, Neon es el candidato más simple por su URI PostgreSQL estándar y conexión externa. Supabase también es compatible, pero sus pausas y la diferencia entre Free y backups de pago deben aceptarse explícitamente.

## 7. Arquitecturas evaluadas

### Arquitectura A — Netlify + backend FastAPI gratuito externo + Neon

```text
Netlify Pages
        ↓
Backend FastAPI externo
        ↓
Neon PostgreSQL
```

**No plenamente viable bajo las restricciones actuales.** Netlify resuelve bien el frontend, pero no se identificó un backend FastAPI permanente, gratuito y sin tarjeta que pueda acompañarlo.

### Arquitectura B — Cloudflare Pages + backend FastAPI gratuito externo + Neon

```text
Cloudflare Pages
        ↓
Backend FastAPI externo
        ↓
Neon PostgreSQL
```

**No plenamente viable sin un backend adicional.** Cloudflare Pages resuelve el frontend. Workers Python no equivale al runtime CPython/Uvicorn/Docker actual y requeriría una adaptación arquitectónica importante.

### Arquitectura C — Vercel para frontend y FastAPI + Neon

```text
Vercel Hobby
  ├── React/Vite
  └── FastAPI como Python Function
          ↓
      Neon Free
```

**Candidata más cercana para demo personal.** Vercel documenta FastAPI en Python Functions y Git-based deployment. Requiere validar el alta sin tarjeta, aceptar las condiciones de uso personal/no comercial y revisar el entrypoint del monorepo. No es equivalente operacionalmente al Web Service Docker de Render.

### Arquitectura D — Railway trial + frontend Netlify/Cloudflare + PostgreSQL Railway o Neon

```text
Frontend estático
        ↓
Railway trial FastAPI/Docker
        ↓
PostgreSQL
```

**Viable solo como prueba temporal condicionada.** El trial tiene créditos y duración limitada; no debe presentarse como producción gratuita permanente.

## 8. Ranking

1. **Vercel Hobby + Neon Free**, únicamente para demo/proyecto personal y después de confirmar el alta sin tarjeta. Conserva FastAPI y PostgreSQL con el menor cambio arquitectónico entre las opciones sin tarjeta investigadas, aunque cambia el modelo de ejecución a Functions.
2. **Netlify o Cloudflare Pages + Railway Trial + Neon/Supabase**, como experimento temporal. No cumple la condición de gratuidad permanente y depende de la elegibilidad del trial.
3. **Netlify o Cloudflare Pages + backend de pago o VPS**, como arquitectura técnicamente más convencional, pero no cumple `$0`.

## 9. Recomendación

```text
OPCIÓN RECOMENDADA:
Vercel Hobby + Neon Free, solo para demo personal/no comercial y con alta sin tarjeta confirmada

FRONTEND:
Vercel React/Vite

BACKEND:
Vercel Python Function con FastAPI

DATABASE:
Neon PostgreSQL Free

ARQUITECTURA:
GitHub → Vercel (frontend + FastAPI) → Neon PostgreSQL
```

Esta recomendación es condicional, no una autorización de despliegue. Si Vercel solicita tarjeta o el uso previsto no es personal/no comercial, debe descartarse bajo las restricciones de esta fase.

## 10. Riesgos y límites

- No se encontró una opción documentada que garantice simultáneamente backend FastAPI permanente, $0 y sin tarjeta.
- Vercel convierte FastAPI en una Function; deben revisarse bundle, duración, conexiones PostgreSQL, cookies, CORS y tareas de arranque.
- Vercel Hobby no debe usarse para un servicio comercial sin cambiar de plan/decisión.
- Neon escala a cero y tiene límites gratuitos; no equivale a una política de backup productiva.
- Supabase Free puede pausar proyectos por inactividad y sus backups/PITR relevantes son de pago.
- Railway es una vía de prueba, no una garantía de producción gratuita permanente.
- Cloudflare Python Workers no es un sustituto transparente de Uvicorn/Docker/FastAPI.
- Netlify Functions no es un Web Service Python/Docker para este backend.
- No se ha validado el comportamiento exacto del monorepo de Marimba Organizer en ningún proveedor.

## 11. Migración futura

La arquitectura recomendada conserva FastAPI, SQLAlchemy, Alembic, PostgreSQL y React/Vite. Si posteriormente se dispone de presupuesto, el backend puede moverse a Render, Railway, Fly.io o un VPS manteniendo el contenedor y el contrato de variables (`DATABASE_URL`, CORS, cookies, SMTP y `SCHEMA_MANAGED_EXTERNALLY`).

El frontend puede moverse de Vercel a Netlify, Cloudflare Pages o un CDN estático sin reescribir React/Vite. Neon puede sustituirse por Render PostgreSQL, Supabase, Railway PostgreSQL u otro PostgreSQL administrado usando migraciones controladas.

## 12. Decisión final

```text
NO EXISTE UNA OPCIÓN QUE CUMPLA TODOS LOS REQUISITOS SIN CONDICIONES.
```

La alternativa más próxima es Vercel + Neon para una demo personal, pero no queda aprobada como producción hasta confirmar la tarjeta, la naturaleza no comercial del uso y la compatibilidad del monorepo con el runtime de Functions.

## 13. Siguiente paso recomendado

No desplegar todavía. La siguiente acción mínima es una decisión humana sobre una de estas opciones:

1. aceptar Vercel Hobby + Neon Free como demo personal y verificar el alta sin tarjeta;
2. aceptar un trial temporal de Railway, sabiendo que no es una solución gratuita permanente;
3. relajar la restricción de tarjeta/costo y usar un Web Service Docker convencional.

Hasta esa decisión, permanecen sin crear: cuentas externas, servicios, bases, tenant, administrador, secretos y despliegues.
