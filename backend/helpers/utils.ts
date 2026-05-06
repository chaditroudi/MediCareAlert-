export const toId = (value: any): string => String(value);

export const toClient = (doc: any) => {
  if (!doc) return doc;
  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const { _id, __v, ...rest } = raw;
  return { id: toId(_id), ...rest };
};

export const toPublicUser = (user: any) => ({
  id: toId(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  profileImageUrl: user.profileImageUrl || undefined,
  location: user.location,
  pharmacyId: user.pharmacyId ? toId(user.pharmacyId) : undefined
});

export const isEmail = (email: string): boolean => /.+@.+\..+/.test(email);
