from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router
from app.api.ai import router as ai_router
from app.api.instant import router as instant_router
from app.api.policies import router as policies_router
from app.api.scans import retest_router
from app.api.scans import router as scans_router
from app.api.sites import router as sites_router
from app.auth.router import router as auth_router
from app.config import settings
from app.db import init_db
from app.seed import seed_initial_data

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_initial_data()
    app.state.arq_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    yield
    await app.state.arq_pool.close()


app = FastAPI(title="TTU Accessibility Compass API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scans_router)
app.include_router(retest_router)
app.include_router(instant_router)
app.include_router(auth_router)
app.include_router(sites_router)
app.include_router(admin_router)
app.include_router(ai_router)
app.include_router(policies_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
