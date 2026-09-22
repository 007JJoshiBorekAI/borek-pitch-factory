import assert from "node:assert/strict";

import { formatActivityAction, formatEmployeeRole, isEmployeeSsoOnly } from "./employeeRoles.js";

assert.equal(formatEmployeeRole("admin"), "Admin");
assert.equal(formatEmployeeRole("consultant"), "Consultant");
assert.equal(formatEmployeeRole(null), "Employee");
assert.equal(formatActivityAction("framework.confirm"), "framework · confirm");
assert.equal(typeof isEmployeeSsoOnly(), "boolean");

process.stdout.write("employeeRoles tests passed\n");
