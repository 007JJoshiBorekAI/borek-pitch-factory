# Azure test environment

The deployment behind

    https://web.gentletree-93d291c0.germanywestcentral.azurecontainerapps.io

is used for internal development and PM testing only. It runs as a test environment: clicking
**Continue with Microsoft** starts a development session directly, without Microsoft OAuth, against
an API that keeps synthetic data in memory.

## What runs

| App (resource group `rg-borek-pitch-prod`) | Role in the test environment |
| --- | --- |
| `web` | Built with the development sign-in for this one hostname. Contains no Supabase project. |
| `api` | `API_DATA_BACKEND=memory`, `AUTH_BYPASS=true`, `RUNTIME_PROFILE=development`, `AI_EXECUTION_MODE=fixture`, `FOLLOWUP_AI_WRITER_ENABLED=false`. Exactly one replica. |
| `worker` | Not used. With the memory backend the API runs every generation job in its own process; a worker has its own, empty memory. Its image is still updated with every deployment, and it receives no work. |
| `renderer` | Not used by the Discovery, Master Presentation V1/V2 and follow-up email journey: those decks are rendered by LibreOffice inside the API container. Its image is still updated with every deployment. |
| Redis | Not used: nothing is queued. |
| Artifacts | Written by the API to its `ARTIFACT_ROOT`. About 50 MB per client that goes through the whole journey. |

Why one replica: the data is in the memory of one process. A second replica would have different
data, and scaling to zero or restarting empties it.

Safeguards that stay in force:

- The API refuses to start with `AUTH_BYPASS=true` unless `API_DATA_BACKEND=memory`. The bypass
  cannot be combined with Supabase, by configuration or by mistake.
- With `RUNTIME_PROFILE=production` the API ignores `AUTH_BYPASS` altogether.
- The web app offers the development sign-in only on the hostname fixed in
  `apps/web/src/lib/authMode.ts`, and only when its build sets both bypass flags and the
  development profile.
- Nobody is asked for a password, so both `web` and `api` are reachable from an IP allow-list
  only. The deploy workflow stops before building when either app has no allow-list.

Supabase is not touched: no data is deleted or changed, the project and its secrets stay as they
are. The test API simply does not use it.

## Roni: first deployment

Needs the Azure CLI with the `containerapp` extension and rights on `rg-borek-pitch-prod`.

1. **Get the testers' addresses** - the office and VPN egress addresses of everyone who tests, in
   CIDR form (`203.0.113.10/32`). A home connection with a changing address is not suitable; use
   the VPN.
2. **Record the current state and restrict access** (changes nothing else; the environment keeps
   running as before):

       cd infra/azure-test-environment
       ALLOWED_CIDRS="<address-1>/32 <address-2>/32" ./configure.sh

   Keep the backup folder it writes. Then check, as the script prints: the web and API addresses
   open from an allowed network and answer 403 from any other (a phone on mobile data).
3. **Tell Blenard that step 2 is verified.** Nothing is deployed before that.
4. **Deploy** by merging the reviewed release pull request into `main`. The push starts the
   "Deploy" workflow: it checks the allow-lists, builds the four images, updates `renderer` and
   `worker`, puts the API into its test configuration together with its new image in one
   revision, then updates `web`. The run's summary lists the revisions that were running before.
   Expect a few minutes during which the page may show errors while the revisions change.
5. **Verify** (from an allowed address):
   - `https://api.gentletree-93d291c0.germanywestcentral.azurecontainerapps.io/health/runtime`
     shows `"api_data_backend":"memory"`, `"ai_execution_mode":"fixture"`, `"auth_mode":"dev_bypass"`.
   - The login page shows **Continue with Microsoft**; clicking it opens the client list with a
     "Development Preview" mark, and the browser never leaves the site.
   - One client can be taken through Discovery, Master Presentation V1, the meeting step with a
     transcript, V2 and the follow-up email, and the `.eml` file downloads.
   - From a network that is not on the list both addresses answer 403.

The `dev` branch must not deploy over this. Its copy of the workflow still deploys on every push
to `dev`, with Microsoft sign-in built into the page while the API stays in test mode. Replace it
with this branch's workflow (which runs for `main` only) before anything else is pushed to `dev`:
that push starts no deployment, because the new file does not run for `dev`.

## Changing who can test

    ALLOWED_CIDRS="<all addresses, old and new>" ./configure.sh access

The list is replaced, not extended: name every address that should keep access.

## Rollback

    ./rollback.sh <backup folder from step 2>          # earlier images and settings, allow-list kept
    ./rollback.sh <backup folder from step 2> open     # and remove the allow-list

`api` and `web` each get a new revision copied from the one recorded before the change (Microsoft
sign-in, Supabase backend, the earlier images). Old revisions are never deleted, so this works as
long as Azure still lists them. Then revert the workflow commit on `main`, otherwise the next push
deploys the test configuration again. Supabase data is exactly as it was; test data is gone.

## What testers should know

- Everyone shares one user and one set of data.
- Data starts empty after every deployment and every restart of the API. A push to `main` is a
  deployment.
- AI runs in fixture mode: the meeting analysis recognises labelled lines such as
  `Requirement: ...` or `[02:15] Daniel: Decision: ...`, and the follow-up email comes from the
  rule-based writer. No model is called and no email is ever sent.

## Returning to real sign-in later

Real users need the Supabase backend and Microsoft sign-in again: roll back as above, or restore
the earlier workflow and settings. Do not turn the bypass off on the web build alone - the API
would still treat every request as the development user.
