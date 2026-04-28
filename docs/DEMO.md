# AI Document Intelligence — Customer Demo Walkthrough

> **Presenter**: Michael Yaacoub — Sr Solution Engineer @ Microsoft
> **Duration**: ~20 minutes
> **Audience**: Technical decision makers, IT leaders, developers

---

## Live Application URLs

| Resource | URL |
|----------|-----|
| **UI Portal** | [https://white-ground-036f98b1e.7.azurestaticapps.net](https://white-ground-036f98b1e.7.azurestaticapps.net) |
| **API Backend** | [https://api-taxforms.azurewebsites.net](https://api-taxforms.azurewebsites.net) |
| **Swagger API Docs** | [https://api-taxforms.azurewebsites.net/docs](https://api-taxforms.azurewebsites.net/docs) |
| **ReDoc API Docs** | [https://api-taxforms.azurewebsites.net/redoc](https://api-taxforms.azurewebsites.net/redoc) |
| **Health Check** | [https://api-taxforms.azurewebsites.net/health](https://api-taxforms.azurewebsites.net/health) |
| **GitHub Repository** | [https://github.com/csdmichael/AI-Document-Intelligence](https://github.com/csdmichael/AI-Document-Intelligence) |

---

## Demo Agenda

1. **Problem Statement** — Why document intelligence matters
2. **Architecture Overview** — Azure services and data flow
3. **Live Demo** — Walk through the application
4. **API & Swagger** — Developer experience
5. **Security & Best Practices** — Enterprise-ready patterns
6. **Q&A**

---

## 1. Problem Statement (2 min)

### Talking Points

- Enterprises process **thousands** of tax exemption forms annually
- Manual data entry is **error-prone** (5-10% error rate) and **slow**
- Different US states have **different form layouts** — no single template
- Compliance requires **audit trails** for every correction
- AI can extract data with **80-95% confidence**, but humans still need to review low-confidence results

### Key Message

> "Azure AI Document Intelligence reduces manual processing time by up to **80%** while maintaining compliance through a human-in-the-loop review workflow."

---

## 2. Architecture Overview (3 min)

### Show the Architecture Diagram

Open [`docs/architecture.md`](../docs/architecture.md) or show the diagram below:

```
┌──────────┐     ┌───────────┐     ┌─────────────────┐     ┌──────────┐
│ Angular  │────▶│  FastAPI   │────▶│  Azure Blob     │────▶│  AI Doc  │
│ Ionic UI │     │  Backend   │     │  Storage (PE)   │     │  Intel.  │
└──────────┘     └─────┬──────┘     └─────────────────┘     └────┬─────┘
                       │                                         │
                       ▼                                         ▼
                 ┌──────────┐                             ┌──────────┐
                 │ Cosmos DB │◀────────────────────────────│  Parsed  │
                 │   (PE)    │    Store results            │  Results │
                 └──────────┘                             └──────────┘
```

### Key Points to Highlight

| Feature | Implementation |
|---------|---------------|
| **Zero-trust security** | All services use Managed Identity — no API keys stored anywhere |
| **Private endpoints** | Storage, Cosmos DB, AI Services accessed within VNet |
| **Infrastructure as Code** | Bicep templates provision everything via GitHub Actions |
| **CI/CD** | Three separate GitHub Actions workflows (Infra, API, UI) |
| **Cost efficient** | Free-tier AI Search, B1 App Service, 400 RU/s Cosmos DB |

---

## 3. Live Demo (10 min)

### Step 1: Show the UI Portal

1. **Open** the UI at [https://white-ground-036f98b1e.7.azurestaticapps.net](https://white-ground-036f98b1e.7.azurestaticapps.net)
2. **Point out** the left-side navigation menu (Angular Ionic with responsive split-pane)
3. **Click** "Blob Files" in the menu

### Step 2: Blob Storage — Raw Documents

> "Here we see the 100 tax exemption PDFs stored in Azure Blob Storage — 2 forms per US state, all generated with realistic handwritten-style data."

- Show the file list with names, sizes, and timestamps
- Explain: "These are the raw PDFs *before* AI processing"

### Step 3: Parsed Documents — AI Results

1. **Click** "Parsed Documents" in the left menu
2. **Point out the stats bar** at the top:
   - 🔵 Blue (>90%) — Outstanding confidence
   - 🟢 Green (>80%) — High confidence
   - 🟡 Yellow (>60%) — Medium confidence
   - 🔴 Red (≤60%) — Needs manual review

> "AI Document Intelligence processed all 100 forms and categorized them into four confidence tiers. The blue documents can be auto-approved, while red ones require human review."

3. **Click filter tabs** to show filtering by category
4. **Show the table** — file names, states, confidence scores, section/field counts

### Step 4: Document Drill-Down

1. **Click on a Red document** (low confidence) to show the detail view
2. **Point out**:
   - Document header with overall confidence badge
   - Status (parsed/reviewed/approved)
   - Metadata grid (sections, fields, parsed date)
3. **Expand a section** by clicking it
4. **Show the fields table**:
   - Extracted value from AI
   - Per-field confidence score with color badge
   - Corrected value column (empty until human edits)

### Step 5: Human-in-the-Loop Correction

1. **Click "Edit"** on a low-confidence field
2. **Type a corrected value** and click "Save"
3. **Point out**: The correction is stored with audit metadata (`correctedBy`, `correctedAt`)

> "Every correction feeds back into our training pipeline. Once we collect enough labeled data, we train a custom Document Intelligence model to improve accuracy for these specific form types."

4. **Click "Approve Document"** to mark as reviewed

### Step 6: Show the Confidence System

> "The confidence system works at three levels:
> - **Field level**: Raw AI confidence per extracted value
> - **Section level**: Average of field confidences
> - **Document level**: Average of section confidences
>
> This roll-up gives reviewers an instant visual indicator of which documents need attention."

---

## 4. API & Swagger Documentation (3 min)

### Show Swagger UI

1. **Open** [https://api-taxforms.azurewebsites.net/docs](https://api-taxforms.azurewebsites.net/docs)
2. **Walk through the endpoints**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health check |
| `/api/blobs` | GET | List raw PDF files in Blob Storage |
| `/api/documents` | GET | List parsed documents (with filters) |
| `/api/documents/stats` | GET | Confidence category statistics |
| `/api/documents/{id}` | GET | Full document detail with sections/fields |
| `/api/documents/{id}/sections/{idx}/fields/{name}` | PUT | Correct a field value |
| `/api/documents/{id}/approve` | PUT | Approve a document |

3. **Try the `/api/documents/stats` endpoint** live in Swagger
4. **Show query parameters** on `/api/documents` — filter by `category`, `state`, `status`

> "The API is fully documented with Swagger/OpenAPI. Developers can integrate with any frontend or build automations on top of it."

### Show ReDoc (optional)

Open [https://api-taxforms.azurewebsites.net/redoc](https://api-taxforms.azurewebsites.net/redoc) for a clean, printable API reference.

---

## 5. Security & Best Practices (2 min)

### Key Points

| Practice | Implementation |
|----------|---------------|
| **No API keys** | `DefaultAzureCredential` + Managed Identity everywhere |
| **Private endpoints** | Blob Storage, Cosmos DB, AI Services within VNet |
| **RBAC** | Least-privilege roles: Blob Data Contributor, Cognitive Services User, Cosmos Data Contributor |
| **OIDC** | GitHub Actions uses federated identity — no stored secrets for Azure auth |
| **Audit trail** | Every correction stored with `correctedBy`, `correctedAt` metadata |
| **Cosmos DB** | `disableLocalAuth: true` — Entra-only authentication |

### Cost Breakdown (Approximate)

| Service | Tier | Est. Monthly Cost |
|---------|------|-------------------|
| AI Document Intelligence | S0 | ~$1.50/1000 pages |
| Cosmos DB | 400 RU/s | ~$24 |
| App Service | B1 | ~$13 |
| Static Web App | Free | $0 |
| AI Search | Free | $0 |
| Blob Storage | Hot | ~$0.50 |
| **Total** | | **~$39/month** |

---

## 6. Q&A Preparation

### Common Questions & Answers

**Q: How accurate is the AI extraction?**
> With the prebuilt-document model, we see 70-95% accuracy depending on form quality. With a custom-trained model (using corrections as training data), accuracy typically reaches 90-98%.

**Q: Can this handle different form types beyond tax forms?**
> Absolutely. AI Document Intelligence supports invoices, receipts, W-2s, insurance claims, contracts — any structured or semi-structured document. The architecture is the same; you just swap the model.

**Q: How does it scale?**
> The S0 tier supports 15 concurrent requests. For enterprise scale, move to S1 for higher throughput. Cosmos DB scales horizontally by partition key (state). The API runs on App Service which auto-scales.

**Q: What about HIPAA/PII compliance?**
> Azure AI Services are HIPAA-compliant. Data stays within your Azure subscription and region. Private endpoints ensure data never traverses the public internet. All auth is via Entra ID.

**Q: How long does it take to process a document?**
> Typically 2-5 seconds per page. The 100-document batch (100 pages) completes in about 5 minutes with parallel processing.

**Q: What's the retraining workflow?**
> 1. Collect corrections from the review UI (stored in Cosmos DB)
> 2. Export labeled data to Document Intelligence Studio
> 3. Train a custom model with 50+ labeled samples
> 4. Deploy the new model and compare confidence scores
> 5. Promote to production when accuracy improves

---

## Demo Checklist

Before the demo, verify:

- [ ] UI portal loads at https://white-ground-036f98b1e.7.azurestaticapps.net
- [ ] API health check returns 200 at https://api-taxforms.azurewebsites.net/health
- [ ] Swagger loads at https://api-taxforms.azurewebsites.net/docs
- [ ] Parsed documents appear with confidence badges
- [ ] At least one Red document is available for edit demo
- [ ] Field edit and save works
- [ ] Document approve works
- [ ] Left menu navigation works on mobile and desktop

---

## Follow-Up Resources

- **GitHub**: [github.com/csdmichael/AI-Document-Intelligence](https://github.com/csdmichael/AI-Document-Intelligence)
- **Azure AI Document Intelligence**: [learn.microsoft.com/azure/ai-services/document-intelligence](https://learn.microsoft.com/azure/ai-services/document-intelligence/)
- **Azure Cosmos DB**: [learn.microsoft.com/azure/cosmos-db](https://learn.microsoft.com/azure/cosmos-db/)
- **Presenter LinkedIn**: [linkedin.com/in/michael-yaacoub-7a46436](https://www.linkedin.com/in/michael-yaacoub-7a46436/)
