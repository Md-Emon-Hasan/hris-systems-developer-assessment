UPDATE "User"
SET "email" = REPLACE("email", '@northstar.example', '@nextventures.example')
WHERE "email" LIKE '%@northstar.example';
