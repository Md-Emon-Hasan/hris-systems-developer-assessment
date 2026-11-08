UPDATE "User"
SET
  "email" = lower(replace("fullName", ' ', '.')) || '@nextventures.example',
  "employeeNumber" = 'NV-' ||
    CASE WHEN "fullName" = 'Abdullah Al Mamun' THEN 'AM' ELSE
      upper(substr("fullName", 1, 1) || substr("fullName", instr("fullName", ' ') + 1, 1))
    END ||
    '-' || substr("employeeNumber", 4)
WHERE "email" LIKE '%@nextventures.example'
  AND "fullName" LIKE '% %';
