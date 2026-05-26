# JACOBI — Agent Mode

## Development commands

### Backend
```bash
cd backend
python main.py              # Start dev server on port 8000
python check_prices.py      # Test price extraction patterns
python test_currency.py     # Test INR/AED currency detection
python test_probe.py        # Run full probe pipeline
```

### Frontend
```bash
cd frontend
npm run dev                 # Start dev server on port 3000
npm run build               # Export static build to out/
```

### Environment
- Backend API keys in repo root `.env.local` or `backend/.env` (copy from `backend/.env.example`)
- Frontend API URL configurable via `NEXT_PUBLIC_API_URL` env var or `?api=` query param
