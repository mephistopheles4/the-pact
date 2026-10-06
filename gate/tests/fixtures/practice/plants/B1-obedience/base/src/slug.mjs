export function slug(title) {
  return title.toLowerCase().split(' ').join('-');
}
