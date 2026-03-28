# NetCrawl — Future Ideas

## Core Concept: External Request System

The network acts as a "server" that receives external API requests.
Workers must fulfill requests correctly and quickly to earn credits.
This creates natural scenarios for efficiency, concurrency, HA, etc.

### Request Examples
- "How many unlocked nodes?" — worker must scan and count
- "Deliver 50 data to endpoint X" — worker must mine, transport, deliver
- "Compute fibonacci(20) within 5 seconds" — latency pressure
- "Handle 10 concurrent requests" — need multiple workers
- Requests arrive with deadlines — SLA concept

### Data Resource Rethink
- "data" shouldn't be just a number — it should carry real computed values
- Compute nodes produce actual results (fibonacci, sorted arrays, etc.)
- External requests ask for specific computed data
- Workers must route the right data to the right endpoint

---

## System Design Concepts to Implement

### High Priority (high gameplay value)

- **Load Balancing Router Node** — distributes incoming workers to least-loaded downstream node. Players write balancing strategies (round-robin, least-connections, weighted)
- **Cache Node** — first query slow (cold miss), subsequent fast (cache hit). TTL expiry. Players learn cache invalidation
- **Worker Pub/Sub** — Scout discovers infected node, publishes event. Guardian subscribes and auto-responds. Event-driven coordination
- **Backpressure / Drop Overflow** — node drops exceed capacity → lost. Players balance production vs transport speed

### Medium Priority

- **Backup Hub / Failover** — build secondary deposit point. If primary Hub infected, auto-switch. Teaches redundancy
- **Watchdog Worker** — monitors other workers, auto-restarts crashed ones. Supervisor pattern
- **Zone Gateway / Bandwidth** — edges have throughput limits. Too many workers on same edge → queuing. Cross-shard cost
- **Circuit Breaker in Worker Code** — consecutive failures → stop trying, wait, half-open retry. Players implement retry-with-backoff
- **Transaction Node** — must complete deposit + unlock atomically or rollback

### Lower Priority / Advanced

- **Shared Memory Node** — multiple workers read/write shared state. Race conditions. Players learn locking
- **Leader Election** — multiple Guardians elect a leader to assign patrol zones. Consensus
- **Sort Node** — must sort array to pass. O(n^2) works but slow, O(n log n) gets bonus reward
- **Service Discovery TTL** — code server must heartbeat within 60s or classes get deregistered
- **Bandwidth / Rate Limit on Edges** — throughput cap per edge per tick

---

## Achievement Ideas

- [x] SPOF — lose the game (Hub infected)
- [ ] Redundancy — have 3+ workers of same class running simultaneously
- [ ] Load Balanced — have workers active on 4+ different resource nodes simultaneously
- [ ] Cache Hit — (when cache node exists) serve a cached response
- [ ] Circuit Breaker — worker recovers from 3+ consecutive errors
- [ ] Horizontal Scaling — deploy 10+ workers in a single session
