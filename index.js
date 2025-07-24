const process = require('node:process')
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

async function extractLinksAndScripts(url) {
    try {
        // 1. 获取 HTML 内容
        const response = await axios.get(url);
        const html = response.data;

        // 2. 解析 HTML
        const $ = cheerio.load(html);
        const baseUrl = new URL(url);
        const baseHref = baseUrl.origin + baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

        // 3. 提取 link[href] 和 script[src]
        const results = [];

        $('link[href]').each((i, el) => {
            const href = $(el).attr('href');
            results.push({
                tag: 'link',
                original: href,
                absolute: new URL(href, baseHref).href
            });
        });

        $('script[src]').each((i, el) => {
            const src = $(el).attr('src');
            results.push({
                tag: 'script',
                original: src,
                absolute: new URL(src, baseHref).href
            });
        });

        return results;
    } catch (error) {
        console.error("Error fetching or parsing:", error);
        return [];
    }
}


// 使用示例
const targetUrl = "https://uiadmin.net/uview-plus/components/intro.html";
const SEARCH_TEXT = 'watchAd()'


// 检查单个 JS 文件
async function checkJsFile(file, config) {
    try {
        let content;

        // 处理本地文件
        if (file.startsWith('file://')) {
            const filePath = file.replace('file://', '');
            content = fs.readFileSync(filePath, 'utf-8');
        }
        // 处理远程 URL
        else {
            const response = await axios.get(file, {
                timeout: config.timeout,
                responseType: 'text'
            });
            content = response.data;
        }

        // 检查是否包含 console.clear()
        if (content.includes(SEARCH_TEXT)) {
            return {url: file, hasClear: true};
        }
        return {url: file, hasClear: false};
    } catch (error) {
        console.error(`Error checking ${file}:`, error.message);
        return {url: file, hasClear: false, error: error.message};
    }
}

async function searchJs(config) {


    console.log('开始检查 JS 文件...');

    const results = [];
    const batches = [];

// 分批处理
    for (let i = 0; i < config.jsFiles.length; i += config.concurrency) {
        const batch = config.jsFiles.slice(i, i + config.concurrency);
        batches.push(batch);
    }

// 处理每个批次
    for (const batch of batches) {
        const batchResults = await Promise.all(batch.map(file => checkJsFile(file, config)));
        results.push(...batchResults);

        // 打印进度
        console.log(`已处理 ${results.length}/${config.jsFiles.length} 个文件`);
    }

// 过滤出包含 console.clear() 的文件
    const filesWithClear = results.filter(r => r.hasClear);

// 打印结果
    console.log(`\n包含 ${SEARCH_TEXT} 的文件:`);
    filesWithClear.forEach(file => {
        console.log(file.url);
    });

// 写入结果文件
    if (config.outputFile) {
        const outputPath = path.resolve(process.cwd(), config.outputFile);
        const outputContent = filesWithClear.map(f => f.url).join('\n');
        fs.writeFileSync(outputPath, outputContent);
        console.log(`\n结果已保存到 ${outputPath}`);
    }

}


extractLinksAndScripts(targetUrl).then(parseURLs => {

    console.log("提取结果:", parseURLs);


// 配置参数
    const config = {
        // JS 文件列表（可以是本地文件路径或 URL）
        jsFiles: parseURLs.map(item => item.absolute),
        // 结果输出文件（可选）
        outputFile: 'results.txt',
        // 请求超时时间（毫秒）
        timeout: 5000,
        // 并发请求数
        concurrency: 30
    };
    searchJs(config).then(() => {
        console.log('\n检查完成');
    })
})
