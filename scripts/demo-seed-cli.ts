async function main() {
  const url = "http://localhost:3000/api/demo/seed";
  console.log(`Sending POST to ${url}...`);

  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      console.error(`Failed: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      process.exit(1);
    }
    const json = await res.json();
    console.log("Demo seed successful!");
    console.log(JSON.stringify(json, null, 2));
  } catch (err: any) {
    console.error("Error connecting to server. Is the Next.js dev server running on port 3000?");
    console.error(err.message);
    process.exit(1);
  }
}

main();
