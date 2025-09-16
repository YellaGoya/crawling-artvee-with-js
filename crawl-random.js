import fs from "fs";
import https from "https";
import url from "url";

import path from "path";
import getPixels from "get-pixels";
import { extractColors } from "extract-colors";

import puppeteer from "puppeteer";
import useSQL from "./pg-connection.js";

(async () => {
  console.log("Crawl Artvee: Crawl Start");

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium-browser",
  });
  const page = await browser.newPage();
  await page.goto("https://artvee.com/c/figurative/");
  console.log('Crawl Artvee: Moved to "https://artvee.com/c/figurative/"');

  // 마지막 페이지 번호 추출
  const lastPageNumber = await page.evaluate(() => {
    const pageNumbers = Array.from(
      document.querySelectorAll(".page-numbers a"),
    );

    pageNumbers.pop();
    return parseInt(pageNumbers.at(-1).innerText.replace(/,/g, ""));
  });
  console.log(`Crawl Artvee: Last page number is ${lastPageNumber}`);

  // 랜덤 페이지로 이동
  const randomPageNumber = Math.floor(Math.random() * lastPageNumber) + 1;
  await page.goto(`https://artvee.com/c/figurative/page/${randomPageNumber}`);

  // 이미지 중복 검사
  const crawled = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll(".product-image-link img")).map(
      (img) => img.src,
    );
    const titles = Array.from(document.querySelectorAll(".product-title a")).map(
      (a) => a.innerText,
    );
    const artists = Array.from(
      document.querySelectorAll(".woodmart-product-brands-links"),
    ).map((obj) => {
      if (obj.firstChild)
        return obj.firstChild.innerText ? obj.firstChild.innerText : "Anonym";
    });

    return { links, titles, artists };
  });

  let link, title, artist;
  while (true) {
    const randomIndex = Math.floor(Math.random() * crawled.links.length);

    const isduplication = await useSQL(
      `SELECT * FROM art WHERE image_link = $1`,
      [crawled.links[randomIndex]],
    );

    if (!isduplication) {
      link = crawled.links[randomIndex];
      title = crawled.titles[randomIndex];
      artist = crawled.artists[randomIndex];
      break;
    }
  }

  // 이미지 다운로드
  const fileName = __dirname + "/downloads/temp.jpg";
  await downloadImage(link, fileName);

  // 색상 추출
  const src = path.join(__dirname, "./downloads/temp.jpg");

  let hexCodes, width, height;
  await getPixels(src, async (err, pixels) => {
    if (err) return;

    const data = [...pixels.data];
    width = pixels.shape[0];
    height = pixels.shape[1];

    hexCodes = await extractHexCodes({ data, width, height });

    const date = new Date().toISOString();
    await useSQL(
      `INSERT INTO art (title, artist, image_link, image_width, image_height, update_date, color_hex_codes ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [title, artist, link, width, height, date, hexCodes],
    );
  });

  await browser.close();
})();

const downloadImage = (url, fileName) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
          res.resume(); // 응답 스트림 소비해서 메모리 누수 방지
          return;
        }

        const fileStream = fs.createWriteStream(fileName);
        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close();
          console.log(`Crawl Artvee: Image saved successfully! "${fileName}"`);
          resolve();
        });
      })
      .on("error", (err) => {
        console.error("Crawl Artvee: Error downloading image:", err);
        reject(err);
      });
  });
};


const extractHexCodes = (img) => {
  return new Promise((resolve, reject) => {
    extractColors(img, { distance: 0.13, hueDistance: 0.05 })
      .then(async (colors) => {
        const hexCodes = colors.map((color) => color.hex);

        resolve(hexCodes);
      })
      .catch(reject);
  });
};
