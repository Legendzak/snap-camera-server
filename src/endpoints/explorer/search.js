import express from 'express';
import { Config } from '../../utils/config.js';
import * as Cache from '../../utils/cache.js';
import * as Util from '../../utils/helper.js';
import * as Web from '../../utils/web.js';
import * as Creator from '../../utils/creator.js';

const useRelay = Config.app.relay.server;
const useWebSource = Config.app.flag.enable_web_source;
const mirrorSearchResults = Config.app.flag.mirror_search_results;

var router = express.Router();

router.post('/', async function (req, res, next) {
    if (!req.body || !req.body['query']) {
        return res.json({});
    }

    const searchTerm = req.body['query'].trim();
    if (searchTerm.length < 3 || (searchTerm.startsWith('(by') && !searchTerm.endsWith(')'))) {
        return res.json({ "lenses": [] });
    }

    if (Util.isGroupId(searchTerm)) {
        const groupLenses = await Creator.getLensGroup(searchTerm);
        if (Array.isArray(groupLenses) && groupLenses.length) {
            for (const lens of groupLenses) {
                Cache.Search.set(lens.lens_id, lens);
            }
            return res.json({ "lenses": groupLenses });
        }
    }

    let searchResults = await Util.advancedSearch(searchTerm);
    if (searchResults && searchResults.length) {
        searchResults = Util.modifyResponseURLs(searchResults);

        // hashtag search (not supported by relay or web)
        if (searchTerm.startsWith('#')) {
            return res.json({ "lenses": searchResults });
        }
    }

    if (useRelay) {
        let relayResults = await Util.relayRequest(req.originalUrl, 'POST', { "query": searchTerm });
        if (relayResults && relayResults['lenses'] && relayResults['lenses'].length) {
            searchResults = Util.mergeLensesUnique(searchResults, relayResults['lenses']);

            if (mirrorSearchResults) {
                Util.mirrorSearchResults(relayResults['lenses']);
            }
        }
        relayResults = null;
    }

    if (useWebSource) {
        let webResults = await Web.search(searchTerm);
        if (webResults && webResults.length) {
            searchResults = Util.mergeLensesUnique(searchResults, webResults);

            if (mirrorSearchResults) {
                Web.mirrorSearchResults(webResults);
            }

            for (let i = 0; i < webResults.length; i++) {
                if (webResults[i].unlockable_id && webResults[i].uuid) {
                    // caching is required to activate the lens if search mirroring is disabled or delayed
                    Cache.Search.set(webResults[i].unlockable_id, webResults[i]);
                }
            }
        }
        webResults = null;
    }

    return res.json({ "lenses": searchResults });
});

export default router;