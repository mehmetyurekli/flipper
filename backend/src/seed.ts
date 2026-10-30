import mongoose from 'mongoose';
import { config } from './config';
import { ProjectSchema } from './projects/project.schema';

const NAME = 'faltona-web';

async function main() {
  await mongoose.connect(config.mongoUri);
  const Project = mongoose.model('Project', ProjectSchema);
  let project = await Project.findOne({ name: NAME });
  if (!project) {
    project = await Project.create({ name: NAME });
    console.error(`Created project "${NAME}"`);
  } else {
    console.error(`Project "${NAME}" already exists`);
  }
  await mongoose.disconnect();
  console.log(String(project._id));
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
