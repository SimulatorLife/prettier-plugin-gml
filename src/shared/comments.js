export function hasComment(node) {
  if (!node) {
    return false;
  }

  const comments = node.comments ?? null;
  return Array.isArray(comments) && comments.length > 0;
}
