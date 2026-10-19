package repository

// RequireServerVersion exposes the version gate to the external test package:
// no older Postgres runs in the tests to reach it through NewDB.
var RequireServerVersion = requireServerVersion
