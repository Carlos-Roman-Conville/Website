// One canonical host (DEFENSE-PLAN item 17): www.crc-solutions.org -> crc-solutions.org.
// Pages' _redirects file cannot redirect by hostname, so this runs in front of every request.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "www.crc-solutions.org") {
    url.hostname = "crc-solutions.org";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
