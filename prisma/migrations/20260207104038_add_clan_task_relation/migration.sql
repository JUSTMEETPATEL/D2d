-- AddForeignKey
ALTER TABLE "clan_task" ADD CONSTRAINT "clan_task_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
