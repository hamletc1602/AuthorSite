import React from 'react';
import {
  Input, NumberInput, Grid, GridItem, Box, Button, Checkbox
} from '@chakra-ui/react'

/**  */
export default function EditorValue({item}) {
    if (item) {
        return <Box
// TODO: custom colurs don't appear to work here. Why?
//            bg='brand.editor'
            bg='white'
        >
            {JSON.stringify(item.value)}
        </Box>
    }
}