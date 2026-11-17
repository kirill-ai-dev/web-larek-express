import { CronJob } from 'cron';
import { cleanupTemporaryFiles } from './files';

/** Запускает ежечасную очистку забытых загрузок старше суток. */
const startTemporaryFilesCleanup = () => CronJob.from({
  cronTime: '0 * * * *',
  onTick: cleanupTemporaryFiles,
  start: true,
  unrefTimeout: true,
  waitForCompletion: true,
  errorHandler: () => process.stderr.write('Не удалось очистить временные изображения\n'),
});

export default startTemporaryFilesCleanup;
