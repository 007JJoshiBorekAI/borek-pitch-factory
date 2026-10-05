import assert from "node:assert/strict";

import { formatEmployeeRole } from "./employeeRoles.js";

assert.equal(formatEmployeeRole("admin"), "Admin");
assert.equal(formatEmployeeRole("consultant"), "Consultant");
assert.equal(formatEmployeeRole(null), "Employee");

process.stdout.write("employeeRoles tests passed\n");
