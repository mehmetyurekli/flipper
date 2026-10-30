/** Shared toJSON options: string _id / projectId, no __v. */
export const toJSONOptions = {
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, any>) => {
    if (ret._id != null) ret._id = String(ret._id);
    if (ret.projectId != null) ret.projectId = String(ret.projectId);
    return ret;
  },
};
