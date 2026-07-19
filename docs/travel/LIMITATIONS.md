# Travel limitations

- Local Compose PostgreSQL validates the additive Market Graph schema, but the application repository currently uses Supabase rather than a direct local PostgreSQL connection.
- The default Compose configuration uses bounded process memory and an inline worker. It is a demo/development mode and loses travel records on API restart.
- A separate worker requires Redis plus shared Supabase travel and Agentcore evidence storage. Running API and worker with separate memory repositories is unsupported.
- Readiness proves required runtime connectivity, not exhaustive provider inventory, legal approval, successful future searches or worker throughput.
- The worker container health check proves that its process and configured runtime are reachable; it does not prove a live provider request.
- Missing Amadeus credentials are reported as `unconfigured`. Production credentials, quota, response validation and commercial approval remain external.
- Amadeus sandbox inventory is synthetic or limited and must remain labelled `sandbox_api`.
- Flight verified savings require fresh price revalidation and complete known mandatory costs.
- Initial Amadeus hotel results may omit property-paid taxes/fees and lack equivalent price revalidation; they cannot produce a verified hotel saving under those conditions.
- Provider inventory is not exhaustive, and no lowest-price guarantee is made.
- Chrome Web Store review, final extension IDs/origins and production page-adapter permissions remain external.
- Static migration tests and local PostgreSQL bootstrap do not prove hosted Supabase RLS. Real anon/user-A/user-B/service-role validation is still required.
- The checked-in Render Blueprint defines a durable API/worker topology, but operators must provision and validate external Redis and Supabase before deployment. Blueprint structure alone does not prove those services are reachable or correctly migrated.
- Render background workers have no free plan; the Blueprint uses paid `starter` services for both API and worker.
- Render `sync: false` values are prompted only during initial Blueprint creation. Existing Blueprint updates and secret rotations require Dashboard configuration.
- Bright Data remains optional for the explicit legacy Deep Audit and is not part of automatic travel comparison.
