import { useEffect, useReducer } from 'react';
import {
    getBuyListItems,
    getBuyListCount,
    getBuyListTotal,
    isInBuyList,
    addToBuyList,
    removeFromBuyList,
    updateBuyListQuantity,
    clearBuyList,
    subscribeBuyList,
    unsubscribeBuyList,
    buildTCGPlayerUrl,
    buildBuyListText,
} from '../services/BuyListService';

export const useBuyList = () => {
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    useEffect(() => {
        subscribeBuyList(forceUpdate);
        return () => unsubscribeBuyList(forceUpdate);
    }, []);

    return {
        items:      getBuyListItems(),
        count:      getBuyListCount(),
        total:      getBuyListTotal(),
        isInList:   isInBuyList,
        addCard:    addToBuyList,
        removeCard: removeFromBuyList,
        updateQty:  updateBuyListQuantity,
        clear:      clearBuyList,
        tcgUrl:     buildTCGPlayerUrl,
        textList:   buildBuyListText,
    };
};
